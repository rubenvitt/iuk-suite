# Design: Modul `lagerbuch` — Spec 1 (der ganze Bau, lokal)

**Datum:** 2026-08-03 · **Stand der Alt-Anwendung:** `main @ ca04eb1` (eingefroren) ·
**Zielmodul:** `src/app/m/lagerbuch/` in `iuk-suite`

> Phase 5 der Konsolidierung. `lagerbuch` ist die Materialverwaltung einer DRK-Bereitschaft und wird
> das **fünfte** Modul der iuk-suite, nach portal, qr, feedback und files.
>
> **Faktenbasis:** `docs/lagerbuch-portierung-analyse.md` (3908 Zeilen; 37 Entscheidungen,
> 28 1:1-Pflichten, 66 Fallen, in Kapitel 7 die beantworteten Betreiberfragen). Jede Aussage über
> Bestandscode dort ist belegt; diese Spec zitiert Belege erneut, wo sie eine Festlegung tragen.
> **Querschnittsregeln:** `docs/design/README.md`. **Projektregeln:** `CLAUDE.md`.
> **Formvorbild:** `docs/superpowers/specs/2026-07-30-files-modul-design.md`.
>
> Zielstack: Next.js 16 (App Router/RSC) · **Ant Design 6** · Drizzle + better-sqlite3 ·
> Auth.js v5 (Pocket ID) · Vitest + Playwright. Eine SQLite-Datei pro Modul (`lagerbuch.db`).
>
> **Belegkonvention.** Pfade ohne Präfix meinen die Zielanwendung (`iuk-suite/src/…`), Pfade mit dem
> Präfix `lagerbuch/` die eingefrorene Alt-Anwendung. Wo ein Kapitel ohne Präfix einen
> Alt-Anwendungs-Pfad zitiert, geht das aus dem Zusammenhang hervor (`src/db/…`, `src/actions/…`,
> `src/lib/…` gibt es nur dort).

---

## 0. Kopf

### 0.1 Die bindenden Betreiber-Entscheidungen vom 03.08.2026

Sie stehen in Kapitel 7 der Analyse und sind für diese Spec nicht verhandelbar.

| # | Entscheidung | Wo sie in dieser Spec wirkt |
|---|---|---|
| 1 | **Domain `lagerbuch.iuk-ue.de`**, ausschließlich konfigurierbar über `SUITE_HOST_LAGERBUCH`; `prodHosts` in der Registry bleibt leer | §2.3, §8.1 |
| 2 | **`TZ=Europe/Berlin`** als Rechengrundlage. ⚠️ Das **Setzen** ist ein suiteweiter Schritt mit eigener Prüfung gegen vier laufende Module und **nicht Teil dieser Spec**; sie rechnet nur mit dem Wert und führt ihn als Runbook-Eingabe. Das Modul hängt zusätzlich **nicht** an der Prozess-`TZ` (§4.5, Entscheidung 26 b) | §1.5, §4.5, §14 |
| 3 | **Der Suite-Admin bekommt KEINE Lagerbuch-Rechte.** Lagerbuch-Admin ist ausschließlich, wer in `SUITE_ADMIN_GROUP_LAGERBUCH` steht — das `feedback`-Muster, das `suiteAdminGroup` bewusst nicht mitliest. ⚠️ Das suiteweite Entfernen des Kurzschlusses in `core/groups.ts:104` ist eigene `core`-Arbeit und **nicht Teil dieser Spec** | §2.5, §3.6 |
| 4 | **`HELFER_SESSION_SECRET` wird aus der produktiven `stack.env` übernommen**, damit laufende Helfer-Sitzungen (bis 12 h) den Cutover überleben. ⚠️ **Für `AUTH_SECRET` gilt das nicht** — begründete Abweichung, §10.6 | §3.4.1, §7.4.1, §10.6 |
| 5 | **Bestellvorschlag = Lückenformel** `max(0, mindestbestand − bestand)` (`src/lib/domain/vorschlag.ts:7-12`); **`BESTELL_FAKTOR` wird ersatzlos gestrichen** | §5.4, §9.2, §10.2 |
| 6 | **Der Suite-Container ist auf dem Server direkt erreichbar**, also an Cloudflare/Traefik vorbei. Die Spec **entscheidet** daraus die Absenderadresse des Gate-Rate-Limits — modul-lokal, ohne `core`-Eingriff | §3.5 |
| 7 | **Der OIDC-`sub`: konservativ annehmen, dass Alt- und Neu-Kennung NICHT übereinstimmen.** Der Zuordnungs- und Bereinigungsweg deckt zugleich den belegten Bruch **innerhalb** von lagerbuch ab (bis `f2b515b` schrieb `src/auth.ts` `users.id` aus einer Zufalls-UUID) und **fällt bei Gleichheit per Identität zur Nulloperation zusammen**. ✅ **Die Client-Hälfte ist inzwischen gemessen und die Annahme aufgelöst:** die Discovery der Pocket-ID-Instanz liefert `subject_types_supported: ["public"]`, der `sub` ist über beide OIDC-Clients identisch — die Zuordnungshälfte kollabiert per Identität, wie vorgesehen. ⚠️ **Der Bruch INNERHALB von lagerbuch bleibt** und ist der teurere Posten: er braucht eine **Bereinigung über die Klarnamen in `users`**, keine Übersetzungstabelle | §4.13 |

### 0.2 Wo diese Spec bewusst von der Empfehlung der Analyse abweicht

Acht Stellen. Jede ist an ihrem Ort ausgeschrieben; hier stehen sie beisammen, damit niemand sie über
fünftausend Zeilen suchen muss.

| # | Abweichung | Statt | Begründung steht in |
|---|---|---|---|
| 1 | `SUITE_ACCESS_GROUP_LAGERBUCH` ist für dieses Modul **kein Schalter**, und ein gesetzter Wert bricht den Boot ab | der `files`-Verknüpfung, die `requiredGroupsFor` mitliest | §2.5 |
| 2 | **Keine Suite-Admin-Abkürzung**; `isModuleAdmin`, `canAdminModule`, `requireModuleAdmin`, `moduleAdminPageOrNotFound` und `session.user.isAdmin` sind für dieses Modul verboten | Entscheidung 9 (b) | §3.6.1, §3.6.3 (Betreiber-Entscheidung 3 gewinnt) |
| 3 | **`AUTH_SECRET` wird NICHT aus der Alt-`stack.env` übernommen** | dem Wortlaut von Betreiber-Entscheidung 4 | §10.6 (die Verwaltungs-Sitzungen überleben, *weil* das Suite-Geheimnis unangetastet bleibt) |
| 4 | Der Cookie-Name bleibt **`helfer_session`**, ohne Modulpräfix | dem präfigierten Hausstil (`files_s_<id>`, `feedback-<id>`) | §3.4.2, §7.4.1 |
| 5 | Die Absenderadresse liest **weder** den ersten **noch** den rechtesten `x-forwarded-for`-Eintrag | beiden Bestandslösungen | §3.5.2 |
| 6 | **`core/ratelimit.ts` wird nicht angefasst** | einer `core`-Änderung | §3.5.4 |
| 7 | `users` wird beim Import **gefiltert übernommen**, nicht geleert | Entscheidung 27 (a) | §4.13 |
| 8 | **`LAGERBUCH_HELFER_SITZUNG_SECRET` kommt über `env_file`**, nicht als `${VAR:?…}`-Zeile | Falle 23s Wortlaut | §10.6 |

### 0.3 Was §6 enthält — und was auch nach §6 noch fehlt

**Die Verwaltungsoberfläche steht in §6** (Rahmen, Seitenlandkarte der 24 Seiten, Navigation,
geteilte Bausteine, Ikonen, Farbe, Typografie, `globals.css`, Filter- und Druckansicht, Selektoren).
Das Kapitel war in einer früheren Fassung dieses Dokuments ein leerer Knoten; es ist eingesetzt und
trägt seine eigene Nummerierung **§6.0 bis §6.15**. §6.0 sagt, was §6 ausdrücklich **nicht**
entscheidet (weil es anderswo entschieden ist), **§6.15** sammelt die 22 Auflagen, die andere
Kapitel an §6 stellen, und nennt je Auflage die Stelle, an der §6 sie einlöst.

**Was auch mit §6 nicht in diesem Dokument steht**, und was ein Task-Plan als eigenen Posten führen
muss:

1. Die **`revalidatePath`-Listen der Verwaltungs-Actions.** Falle 49 ist entschieden (innere Form,
   §2.1 g), aber die Zuordnung „welche Action revalidiert welche Pfade" ist enumerierbare Arbeit
   über 61 Bestandsaufrufe. Für die zwei Helfer-Actions ist sie in §7.9.5 ausgeschrieben, für die
   Verwaltungs-Actions nicht (§15.3, Nr. 23).
2. Die Zuordnung **jede Server Action → Seite → Bedienelement** (§6.12, Frage 1) — sie ist als
   Auflage an die Bau-Task formuliert, nicht als Tabelle in diesem Dokument.
3. Der **seitenweise Feinbau** je Seite: §6.2.2 legt je Seite Aufgabe, antd-Bausteine und die
   Aufteilung Server-Seite/Client-Insel fest, nicht die einzelne Spaltenreihenfolge.

---

## 1. Gegenstand und Abgrenzung

### 1.1 Was das Modul `lagerbuch` ersetzt

`lagerbuch` ist die Materialverwaltung einer DRK-Bereitschaft und wird das **fünfte** Modul der
iuk-suite. Es führt den Bestand des Handlagers und jedes Fahrzeugs — **nie als Spalte, immer als
Summe eines append-only Buchungsjournals** (`src/db/bestand.ts:13-20`, `src/db/queries.ts:40-41`).
Daran hängen fünf Fachbereiche: Bestand & Chargen (FEFO, monatsgenauer Verfall, Aussondern),
Fahrzeug-Check (Ist gegen `soll_positionen`, Nachfüllung, Geräte- und Sauerstoff-Quittierung),
Geräte (MTK-/Ablauf-Fälligkeit, Barcode-Deep-Link `/g/<code>`), Blutzucker & Sauerstoff, und
Betrieb (Bestellvorschlag, Inventur, CSV-Import, Excel-Export, Journal mit Klarnamen,
Etikettendruck, Zugangs-Codes).

**Zwei Zugangswege, und das ist das strukturell Neue an dieser Phase.** Helferinnen und Helfer
kommen **ohne Konto** herein: sie scannen ein laminiertes Kärtchen (`/t/<code>`) oder tippen den
sechsstelligen Code am Gate ein; daraus entsteht eine eigene, mit `jose` signierte Sitzung im Cookie
`helfer_session` (`src/lib/auth/helferSession.ts:10-16`, Vorgabe 12 h). Die Verwaltung meldet sich
per OIDC gegen Pocket ID an. Beide Wege werden heute von **einer eigenen `src/middleware.ts`** in
zwei Edge-Cordons durchgesetzt (`src/middleware.ts:34-36`, Matcher `/verwaltung/:path*`,
`/helfer/:path*`, `/a/:path*`) — und genau die gibt es in der Suite nicht (§2.8).

Der eingefrorene Stand ist **`main @ ca04eb1`** (03.08.2026), nicht `2361f40`; jeder Beleg dieser
Spec ist dort verankert. Fünf Belege kommen erst mit diesem Stand herein und sind Teil des Umfangs:
`src/lib/auth/cordon.ts` (`verwaltungCordonDecision`, `adminLandingPfad`), `src/lib/auth/konto.ts`,
die Zeilennummern in `CheckFlow.tsx`, die drei Dateikonventions-Icons und der dritte Test in
`e2e/verwaltung.spec.ts`.

**Was `lagerbuch` mit den vier laufenden Modulen teilt:** eine SQLite-Datei, Drizzle, Auth.js gegen
Pocket ID, gedruckte QR-Codes im Feld. **Was neu ist:** eine zweite, anonyme Sitzung mit eigenem
Geheimnis; ein Journal, dessen Unveränderlichkeit per SQLite-Trigger erzwungen wird
(`drizzle/0001_append_only.sql:1-11`); ein Etikettenbogen, dessen Richtigkeit man in Millimetern auf
gekauftem Papier misst; und eine Oberfläche, die als einzige der bisherigen Alt-Apps eine eigene,
durchgestaltete Anmutung trägt.

### 1.2 Was Spec 1 enthält

**Der ganze Bau, lokal lauffähig und lokal abnehmbar.** Alles, was ohne Produktionsdaten und ohne
Domainwechsel gebaut und geprüft werden kann:

1. **Modulgerüst** — Registrierungs-Dreieck, Registry-Eintrag, Host-Riegel, Route-Baum,
   Shell-Varianten je Bereich, `nav`-Slot, Modul-DB samt Migrationen (§2).
2. **Datenmodell und Migrationen** — 16 Tabellen, die zwei Append-only-Trigger-Paare, die drei
   Modell-Unsauberkeiten aus Analyse-Abschnitt 2.1 (§4).
3. **Beide Zugänge** — die Helfer-Sitzung (`jose`, eigenes Geheimnis), der Verwaltungs-Riegel als
   aufrufbare Funktion, die Vollständigkeit der 44 Action-Guards, `/t/<code>` und das Gate (§3).
4. **Die Absenderadresse für das Rate-Limit** — die Frage, die Betreiber-Entscheidung 6 aufwirft, ist
   **in Spec 1 entschieden** (§3.5): `_lib/absender.ts` liest `cf-connecting-ip`, sonst einen
   konstanten Sammelschlüssel, und **niemals `x-forwarded-for`** — weder den ersten noch den
   rechtesten Eintrag. ⚠️ **`core/ratelimit.ts` wird dabei nicht angefasst** (§3.5.4); für portal,
   qr, feedback und files ändert sich nichts. Die drei Zähler und der Verbrauchszeitpunkt stehen
   ebenfalls in §3.5.
5. **Der Helfer-Weg** — Gate, `/t/<code>`, `/a/<artikelId>`, `/g/<code>`, `/helfer`, `/helfer/check`
   (§7).
6. **Die Verwaltungsoberfläche** — Rahmen und Riegel beider Group-Layouts, die Landkarte der 24
   Seiten mit ihren antd-Bausteinen, `LAGERBUCH_NAV` und die `.modulnav`-Reparatur, die geteilten
   Bausteine, Ikonen, die Ampelpalette mit Hexwerten, Typografie, die drei Eimer aus `globals.css`,
   die zwei Filterregime und die Selektoranker (§6). Dazu die Querschnittsregeln, die anderen
   Kapiteln gehören: URL-State und die drei stillen Deckel (§5.13, §5.14), Fehlerzustände (§11.5),
   Zugriffsriegel (§2.5, §3.6), Ausgabeformate (§9). ⚠️ **Die `revalidatePath`-Listen der
   Verwaltungs-Actions stehen NICHT in diesem Dokument** — siehe §0.3 und §15.3, Nr. 23.
7. **Etiketten und Druck** — Token-Kärtchen und Artikel-Regaletiketten, die Druck-Route ohne Shell
   (§8).
8. **Ausgabeformate** — `bestellvorschlag.csv`, der Excel-Export, die Zwischenablage (§9).
9. **Compose- und `.env`-Zeilen** — `SUITE_HOST_LAGERBUCH`, `SUITE_ADMIN_GROUP_LAGERBUCH`,
   `LAGERBUCH_HELFER_SITZUNG_SECRET` und die Zahlen aus §10.3. ⚠️ **Die Zeile kommt über `env_file`,
   nicht als `${VAR:?…}` unter `environment`** — begründete Abweichung von Falle 23s Wortlaut, §10.6;
   der Riegel dagegen ist die bedingte Boot-Prüfung (§10.5), und sie hält das Scheitern in der
   Startzeit.
10. **Vier Laufzeit-Abhängigkeiten** in `iuk-suite/package.json`: `jose`, `write-excel-file`,
    `@zxing/browser`, `@zxing/library` (Falle 58 — unter pnpm ist ein nur transitiv vorhandenes Paket
    nicht importierbar). `qrcode` und `nanoid` sind vorhanden.
11. **Testaufbau** — welche Aussage wem gehört (§12), und die sieben E2E-Zusicherungen, für die ein
    **ersetzender** Test geschuldet ist, bevor die alte Spec gelöscht wird (§12.1).

Spec 1 baut **nichts**, was Produktionsdaten braucht. Umgekehrt erfindet Spec 1 **keine Zahl**, die
nur der Server kennt: solche Werte sind als benannte Runbook-Eingabe geführt (§14).

### 1.3 Was ausdrücklich Spec 2 ist

- **Der Datenumzug** — der zeilenweise Import (§4.3 entscheidet ihn, Spec 2 führt ihn aus), der
  Paritätscheck über `scripts/import/parity.ts` und die feldweisen Stichproben gegen die
  Alt-Anwendung. **Der Paritätscheck beweist den Datenbank-Rundlauf, nicht die Richtigkeit der
  Feldzuordnung** — ein konsistenter Mapping-Fehler ist paritätsgrün (`CLAUDE.md:97-99`).
- **Die gefilterte `users`-Übernahme und die Bereinigung der Waisenzeilen** (§4.13). Der Weg selbst
  ist Struktur und steht in dieser Spec; **ausgeführt** wird er in Spec 2. ✅ Die `sub`-**Messung**
  gegen die Suite ist erledigt (`subject_types_supported: ["public"]`, §4.13, Befund 2); was Spec 2
  erbt, ist die Stichprobe R11 gegen die echten Daten und der Entwurf der **Bereinigung über die
  Klarnamen** — den Bruch innerhalb von lagerbuch räumt die Messung nicht weg.
- **Generalprobe** mit Snapshot-Kopie.
- **Der Cutover** — `SUITE_HOST_LAGERBUCH`, `SUITE_TRAEFIK_RULE`, Reihenfolge, Verifikation gegen
  einen ephemeren Container ohne Traefik-Labels, Router umschwenken, zwei Wochen Standby, Rollback.
- **Die Übernahme von `HELFER_SESSION_SECRET`** aus der produktiven `stack.env` unter dem neuen
  Schlüsselnamen — **und die Abbau-Zeile dazu**: ein übernommenes Geheimnis lebt danach in zwei
  Dateien auf demselben Server. Wird der Alt-Stack abgebaut, ohne die alte `stack.env` zu löschen,
  bleibt ein gültiges Sitzungsgeheimnis in einer Datei liegen, die niemand mehr pflegt.
- **Erhebung aller Serverzahlen** (Betreiberfragen 9 ff.: Größe von `lagerbuch.db`, Zeilenzahlen,
  älteste `buchungen.ts`, produktive Werte der Zahlen aus §10.3).
- **Wegsichern des alten `backups/`-Verzeichnisses** aus dem Volume `lagerbuch_data` vor dem Abbau
  des Alt-Stacks — es ist die einzige historische Tiefe vor dem Cutover-Snapshot.
- **Umstellung des externen Monitors** von `<host>/api/health` auf `/api/health/lagerbuch` (§2.7).
- **Abbau des Alt-Stacks** und Archivierung bzw. Korrektur von `deployment.md`, dessen Aussage „der
  Container schreibt aktuell keine Backups von selbst" (`deployment.md:120-125`) dem Code
  widerspricht (`src/instrumentation.ts:11-18`, `src/db/backup.ts:38-46`).

### 1.4 Was Spec 2 von hier erbt

Diese Liste ist verbindlich. Wo Spec 2 davon abweicht, ist es ein Fehler in Spec 2, nicht hier.

| Festlegung | Wert | Folge für Spec 2 |
|---|---|---|
| Modul-Key | `lagerbuch` | DB-Datei `lagerbuch.db` unter `DATA_DIR`, `SUITE_HOST_LAGERBUCH`, `SUITE_ADMIN_GROUP_LAGERBUCH` |
| Migrationsverzeichnis | `src/app/m/lagerbuch/_db/migrations` | Dateinamen kommen aus `meta/_journal.json` und werden **nicht** erfunden (§2.2, §4.3) |
| Prod-Domain | `lagerbuch.iuk-ue.de`, ausschließlich über `SUITE_HOST_LAGERBUCH`; Registry `prodHosts: []` | Cutover = eine `.env`-Zeile plus `SUITE_TRAEFIK_RULE`; Rollback = dieselbe Zeile leeren. ⚠️ Die **gedruckten Etiketten** werden dadurch nicht konfigurierbar (§2.3, §8.1) |
| Öffentliche Pfadform | `/`, `/t/<code>`, `/g/<code>`, `/a/<artikelId>`, `/helfer/*`, `/verwaltung/*` bleiben **wörtlich** | Entscheidung 18 (a): der Rewrite `<host>/a/x` → `/m/lagerbuch/a/x` (`core/routing.ts:78-79`) macht das ohne Änderung; die Entscheidung gehört trotzdem ausdrücklich ins Runbook |
| Append-only | die zwei Trigger aus `drizzle/0001_append_only.sql:1-11` **plus** das neue Paar auf `bz_kontrollen` müssen im Zielmigrationssatz **stehen** (§4.4) | Ein Importer mit reinem `INSERT` läuft durch; `onConflictDoUpdate` — das Muster beider vorhandener Importer — **bricht** an `buchungen` beim zweiten Lauf. Wiederholbar ist `INSERT OR IGNORE`. **`INSERT OR REPLACE` ist die Falle:** es läuft bei `recursive_triggers = 0` (dem Default; `openModuleDatabase` setzt es nicht) durch und **umgeht den Trigger** |
| Einfügereihenfolge | artikel → fahrzeug_templates → template_positionen → lagerorte → chargen → soll_positionen → buchungen/checks/lagerort_verfall → bz_geraete/o2_flaschen/geraete → bz_kontrollen/o2_messungen → tokens → users (§4.14) | `lagerorte.templateId` → `fahrzeug_templates` (`schema.ts:15`) sieht rückwärts aus; zweite Abhilfe ist `PRAGMA defer_foreign_keys = ON` **innerhalb** der Transaktion, mit den zwei gemessenen Grenzen aus §4.14 |
| Zeitstempel-Einheit | Unix-**Sekunden**, Drizzle `mode: "timestamp"` | Faktor-1000-Fehler ist paritätsgrün; der Mapper normalisiert auf ganze Sekunden (§4.5) |
| Zeitzone | die Spec rechnet mit `Europe/Berlin` **und verdrahtet ihn als Modulkonstante** | `TZ` wird von dieser Spec **nicht** gesetzt (§1.5); der Wert ist Runbook-Eingabe. Das Modul hängt bewusst nicht daran (§4.5) |
| Geheimnisse | **nur** `HELFER_SESSION_SECRET` aus der produktiven `stack.env`, unter dem neuen Namen `LAGERBUCH_HELFER_SITZUNG_SECRET` | laufende Helfer-Sitzungen (bis 12 h) überleben den Cutover — **nur, wenn der Modul-Host zeichengleich der heutige ist** (host-only Cookie, §7.4.1). `AUTH_SECRET` der Suite bleibt unverändert (§10.6). Abbau-Zeile: alte `stack.env` löschen |
| Kennungen (`sub`) | ✅ **gemessen: gleich.** Die Discovery der Pocket-ID-Instanz liefert `subject_types_supported: ["public"]`, es gibt keine pairwise identifiers — der `sub` ist über beide OIDC-Clients derselbe (§4.13, Befund 2) | **Es gibt keine Zuordnungstabelle**, und sie wird auch nicht mehr gebraucht: der Weg fällt **per Identität** zur Nulloperation zusammen, der erste Suite-Login trifft die importierte Zeile. Die Bauform bleibt, wie sie ist — beide Kennungsräume **dürften** in `users` nebeneinander leben, es entsteht nur keiner. ⚠️ Der Paritätscheck beantwortete die Frage nie (in beiden Fällen grün); die Stichprobe R11 bleibt |
| `users`-Tabelle | Altbestand wird **gefiltert übernommen**, nicht geleert (§4.13, begründete Abweichung von Entscheidung 27 a) | Eine Zeile wandert genau dann, wenn ihre `id` in einer der sechs Autorenschaftsspalten vorkommt — das Prädikat **ist** der Waisenfilter. **Historische Journalzeilen lösen damit sofort auf einen Klarnamen auf** — ⚠️ **außer bei den Personen, deren einzige `users`-Zeile eine Waise ist** (letzte Anmeldung vor `f2b515b`, 29.07.2026; der Freeze liegt fünf Tage später). Für die zeigt das Journal die rohe Kennung, und ihr Klarname steht **nur** in der Zeile, die der Filter aussortiert. Das ist der eine verbleibende Posten aus §4.13 und braucht eine **Bereinigung über die Klarnamen**, keine Übersetzungstabelle. `select count(*) from users` ist ohnehin **keine** Personenzahl |
| `BESTELL_FAKTOR` | **ersatzlos gestrichen** | Kein Produktivpfad liest das Feld (`config.ts:38,76`; einzige Fundstellen sind Tests, und die werden mitgestrichen). Ein produktiv gesetzter Wert hat nie etwas bewirkt; er wandert **nicht** mit |
| Bestellvorschlag | Lückenformel `max(0, mindestbestand − bestand)` (`src/lib/domain/vorschlag.ts:7-12`) | die Faktor-Formel aus `implementierungsplan.md:75/:202` ist tot; keine Zeile der Bestellliste ändert sich |
| Health | `/api/health/lagerbuch` (`core/health/index.ts:4-16`) | `<host>/api/health` antwortet nach dem Cutover weiter `ok`, **ohne etwas über lagerbuch zu sagen** (Falle 51). Monitor und `deployment.md` umstellen |
| Alte Modul-Endpunkte | `src/app/api/health/route.ts` und `src/app/api/auth/[...nextauth]/route.ts` werden **nicht** portiert | beide Präfixe stehen in `PASSTHROUGH` (`core/routing.ts:12`) und erreichen das Modul nie (§2.7) |
| Rollback-Körnung | grob | ein Rückzug auf ein älteres Image nimmt portal, qr, feedback und files mit. Der Teilrückzug ist `SUITE_HOST_LAGERBUCH` leeren + Host aus `SUITE_TRAEFIK_RULE` — er nimmt die Domain vom Netz, statt eine ältere lagerbuch-Version auszuliefern |

### 1.5 Was ausdrücklich **nicht** Teil dieser Spec ist

Vier Arbeiten liegen benachbart, gehören aber nicht hierher. Jede von ihnen fällt sonst als
Nebenwirkung einer Modul-Spec an — und das ist genau die Art, in der eine suiteweite Entscheidung
still getroffen wird.

1. **`TZ=Europe/Berlin` setzen.** Der Suite-Container fährt heute ohne `TZ`; `node:26-alpine`
   liefert UTC. Alles, was portal, qr, feedback und files bisher an Datumsgrenzen gezogen haben, ist
   in UTC gezogen worden — ein nachträgliches `TZ` verschiebt jede solche Grenze um ein bis zwei
   Stunden (u. a. gerundete Zeitstempel in `feedback`, jede Tagesbildung in `qr`). ⚠️ **Eigener
   Schritt mit eigener Prüfung gegen die vier laufenden Module.** Diese Spec **rechnet** mit
   `Europe/Berlin`, verdrahtet ihn als Modulkonstante (§4.5) und führt ihn als Runbook-Eingabe.
2. **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts:104`.** `isModuleAdmin` steigt
   heute für **jedes** Modul beim Suite-Admin früh mit `true` aus. Der Kurzschluss ist kein
   Versehen — `core/groups.ts:14` schreibt seinen Zweck aus: „Ist überall Admin, damit ein Modul
   nicht aussperrbar ist." Ihn zu entfernen ist `core`-Arbeit und berührt portal, qr und files.
   ⚠️ **Nicht Teil dieser Spec.** lagerbuch erreicht dasselbe Ziel modulintern, indem es
   `isModuleAdmin` gar nicht erst benutzt (§2.5, §3.6) — und ist damit vorwärtskompatibel zu dem
   Refactoring, wann immer es kommt.
3. **Das suiteweite Gating von `/m/*`.** Dass `/m/<key>/*` von jedem Suite-Host beantwortet wird, ist
   eine Klasse und kein lagerbuch-Problem (Falle 61); der Symptomfund `iuk-ue.de/m/beta` ist bereits
   dokumentiert und bewusst nicht behoben. ⚠️ **Eigene Suite-Spec.** Für Phase 5 genügt der
   modulinterne Host-Riegel aus §2.6 — lagerbuch ist allerdings das erste Modul, bei dem diese Klasse
   eine **Datenwirkung** hätte statt einer kosmetischen, und genau deshalb ist der Riegel hier nicht
   optional.

4. **`deploymentId` und der Release-Kanal (Entscheidung 23).** ⚠️ Diese Spec hat sie an mehreren
   Stellen „dem Betriebskapitel" zugeschrieben — **ein solches Kapitel gibt es nicht**, weder hier
   noch in der Abgrenzung von Spec 2 (§1.3). Damit gehören sie in dieselbe Klasse wie die drei
   Punkte oben: suiteweit, nicht lagerbuch-eigen. `deploymentId` nachzurüsten berührt alle fünf
   Module, der Release-Kanal ist eine Compose-Frage. ⚠️ **Eigenes Vorhaben, §15.3 Nr. 24.** Die
   Empfehlung der Analyse — (a) `deploymentId` suiteweit nachrüsten, (d)
   `image: ghcr.io/rubenvitt/iuk-suite:${SUITE_IMAGE_TAG:-latest}` nach dem Muster von
   `iuk-suite/compose.yaml:102` — bleibt unangetastet und wandert mit dorthin. **Kein Bauweg dieser
   Spec hängt daran**, deshalb blockiert die offene Frage nichts; sie braucht nur einen Eigentümer.

Ebenso benachbart und ausdrücklich nicht durchgeführt: die Hebung des DOM-Test-Harness nach
`src/core/` (§12.2).

---

## 2. Modulgerüst

### 2.1 Der Verzeichnisbaum

```
src/app/m/lagerbuch/
  layout.tsx                Trägt AUSSCHLIESSLICH `export const metadata = { manifest: … }`
                            und rendert {children}. KEINE Shell, KEIN Riegel, KEIN Rahmen (§2.8,
                            §7.1.1, §7.10.2). Es ist die einzige Stelle, an der der Manifest-Verweis
                            stehen darf — im Root-Layout bewürbe ihn JEDER Suite-Host.
  _db/
    schema.ts                 Drizzle-Tabellen (16)
    client.ts                 getDb() — MODUL-EIGENER Opener (§5.13.2): öffnet über
                              openModuleDatabase(moduleDbPath("lagerbuch")), registriert die
                              SQLite-Funktion `lb_falte` und cacht unter DEMSELBEN
                              globalThis.__suiteDb["lagerbuch"], das getModuleDb benutzt.
    drizzle.config.ts         repo-root-relativ, dbCredentials.url "./.data/lagerbuch.db"
    migrations/               von drizzle-kit erzeugt + meta/_journal.json
                              — MUSS die zwei Append-only-Trigger-Paare enthalten (§4.3, §4.4)
    migrations.test.ts        echter Migrationslauf: Spalten, Typen, Indizes, Sekunden-Mode
    append-only.test.ts       portiert aus `src/db/append-only.test.ts:25-37`; läuft gegen einen
                              ABGESPIELTEN Migrationssatz, nicht gegen ein gepushtes Schema
    quelle.ts                 quelleAufloeser — Kennung → Klarname (§4.13)
    etiketten.ts              etikettenDaten(db) — async, SVG statt Data-URL (§8.4)
                              ⚠️ KEIN queries.ts: _db/ hält keine Fachabfrage (§2.1 h)
    aggregate.test.ts  suche.test.ts  fefo.test.ts  check-abschluss.test.ts  inventur.test.ts
    template-sync.test.ts  client.test.ts                                     (§5.19.2)
    quelle.test.ts            Aussagen: §4.16 Punkt 4. Laufart: echte SQLite-Datei wie die neun
                              darüber — deshalb liegt sie hier und nicht bei _lib/
  _lib/                       KEIN "use client" in diesem Ordner (Falle 6, CLAUDE.md:24-27)
    host.ts                   istLagerbuchHost / requireLagerbuchHost / lagerbuchHostOderNull (§2.6)
    zugang.ts                 Viewer, viewerAusSession, viewerOderNull, istLagerbuchAdmin,
                              requireLagerbuchAdmin, verwaltungsZiel, adminLandingPfad (§2.5, §3.6)
                              ⚠️ ZWEI FORMEN, EINE REGEL (§3.2.1): der werfende Riegel
                              requireLagerbuchAdmin gehoert in Layouts und Verwaltungs-Actions;
                              das nicht-werfende Paar viewerOderNull + istLagerbuchAdmin gehoert
                              in die beiden Rollen-Weichen und aufs Gate — dort ist "keine
                              Sitzung" ein DRITTER gueltiger Fall, kein Fehlerfall.
                              adminLandingPfad hat GENAU EINEN Aufrufer: page.tsx (§7.2.4).
    helferSitzung.ts          jose-Cookie: HELFER_COOKIE, HelferPayload, createHelferSitzung,
                              verifyHelferSitzung, helferCookieOptionen (§3.4)
    helferZugang.ts           HelferZugang, helferZugangOderNull, requireHelferSitzung,
                              requireHelferSchreibend (§3.4.4) — ruft intern requireLagerbuchHost
    konto.ts                  merkeNutzer(db, viewer) (§4.13)
    absender.ts               absenderAus(headers) — der Buendelungsschlüssel des Gates (§3.5.2)
    gateSchranke.ts           die drei Zähler und die lesbare Sperrzeit. GENAU ZWEI Exporte:
                              gateGesperrt(absender) → Restsekunden | null, und
                              gateFehlversuchBuchen(absender) → void (§3.5.3)
    gateTexte.ts              GateGrund + gateMeldung(grund, sperrSekunden) — die vier Gate-Texte
                              aus §3.9 an EINER Stelle, gelesen von page.tsx und _actions/gate.ts
    boot.ts                   lagerbuchBootFehler() — alle Startzusagen an einer Stelle (§10.5)
    grenzen.ts                die Zahlen mit Einheit im Namen (§10.3)
    konstanten.ts             HANDLAGER_ID, PSEUDO_VERFALL, ZUSTAENDE, MONAT_REGEX, die Enum-Listen (§5.1)
    zeit.ts                   ZEITZONE + sieben Zonenfunktionen (§4.5) — KEINE Prozess-TZ
    marke.ts                  LAGERBUCH_MARKE / _ORGANISATION / _ZEILE (§10.2)
    code.ts                   normalisiereCode (§7.5.3)
    barcode.ts                normalisiereBarcode (§7.6.2)
    tokenZiel.ts  returnTo.ts zeichengleich aus dem Bestand (§7.2.5)
    suche.ts                  falte() — die eine Faltung für JS- und SQL-Hälfte (§5.13.2)
    actionTypen.ts            HelferGrund, HelferErgebnis<T> (§7.3) — bewusst NICHT unter
                              _actions/, sonst braeuchte der Guard-Scan eine Ausnahme (§2.1 a)
    etikettMasse.ts           die Millimeterwerte, die Server- UND Client-Seite brauchen (§8.4).
                              grenzen.ts haelt bewusst KEINE Millimeter (§10.3)
    ampel.ts                  Ton/Ampel, ampelTon UND die Hexwerte beider Modi (§5.17, §6.6.2)
    schrift.ts                die sieben Typografie-Rollen als CSSProperties (§6.7.2)
    nav.ts                    LAGERBUCH_NAV — 15 Einträge, äußere Pfadform (§2.10, §6.3.1)
    format.ts  checkErgebnis.ts  artikelFilter.ts  journalZeile.ts
    checkNutzlast.ts  bestandExportSpalten.ts  bestandExport.ts  csvZelle.ts  csvBestellung.ts
    bestellText.ts
    domain/                   die reinen Funktionen (§5.1)
      bestand.ts  fefo.ts  verfall.ts  vorschlag.ts  o2.ts  geraet.ts  bz.ts  check.ts
    lesepfade/                artikel.ts · journal.ts · verfall.ts · fahrzeuge.ts · checks.ts ·
                              bestellung.ts · bz.ts · o2.ts · geraete.ts · bestand.ts (§5.2.4)
    schreibpfade/             abbuchung.ts · umlagerung.ts · korrektur.ts · lagerortVerfall.ts ·
                              templateSync.ts
    <je *.test.ts daneben>
  _actions/                   ALLE Server Actions ("use server"), 18 Action-Dateien (ohne guards.test.ts)
                              mit zusammen 47 Actions — die Abbildung Alt→Neu steht in §2.1 a
    gate.ts                   einloesenAmGate            ┐ die DREI Einträge der Ausnahmeliste
    sitzung.ts                erneuereSitzung · beenden  ┘ (§3.8.2) — jeder einzeln begründet
    buchung.ts  check.ts      requireHelferSchreibend als ERSTE Anweisung (§7.4.3)
    artikel.ts  detail.ts  inventur.ts  csv.ts  tokens.ts  loeschen.ts  fahrzeuge.ts
    templates.ts  geraete.ts  bz.ts  sauerstoff.ts  bestellung.ts  aussondern.ts
    lagerortVerfall.ts        verfallSetzen — die Verwaltungsseite des Verfalls (§5.6.2).
                              Gleicher Basisname wie _lib/schreibpfade/lagerortVerfall.ts,
                              verschiedene Datei: die Action riegelt und validiert, der
                              Schreibpfad setzt (setzeVerfall). Dieselbe Doppelung wie bei
                              bz.ts, geraete.ts und verfall.ts — das ist die Hausform.
                              ⚠️ Es gibt KEIN chargen.ts (§2.1 a)
    guards.test.ts            liest jede Datei und behauptet: jede exportierte Action beginnt mit
                              requireLagerbuchAdmin() oder requireHelferSchreibend() — oder steht
                              auf der DREI Einträge langen Ausnahmeliste (§3.8.2)
  _ui/                        antd-Bausteine der Verwaltung + Modul-CSS (--lb-*).
                              HIER lebt der Client-Code: alles mit "use client" gehört hierher,
                              nie nach _lib/ (Falle 6).
    VerwaltungsRahmen.tsx     Shell full + nav — EINE Stelle, ZWEI Importeure:
                              verwaltung/(arbeit)/layout.tsx und g/[code]/page.tsx (§2.9).
                              Hausform von files (m/files/_ui/VerwaltungsRahmen.tsx:12).
                              `nav` ist Pflicht-Prop, die Aufrufer lesen _lib/nav.ts (§2.10)
    DruckRahmen.tsx           Rahmen OHNE Shell für den Etikettenbogen
    HelferRahmen.tsx          Vollbildgerüst des Helfer-Zweigs, KEIN antd. DREI Pflicht-Props:
                              `aktiv`, `sitzungsetikett`, `laeuftAb` (§7.8.2). Server-Komponente
    Restzeit.tsx              "use client": zeigt die Ablaufzeit und ab 30 Minuten Restlaufzeit
                              den Hinweis aus §3.4.3 Punkt 1. Formatiert NICHT selbst — Uhrzeit
                              und Startschwelle kommen fertig vom Server (§7.8.2)
    OeffentlicherRahmen.tsx   Gate/Deep-Link-Rahmen, KEIN antd
    ikonen.tsx                Inline-SVG, KEIN "use client" — 36 Namen, Vorgabe 18px (§7.7.4, §6.5.2)
    ikonen.test.ts            Modul-Scan: kein @ant-design/icons, kein lucide-react, jeder
                              IkonName steht in PFADE (§6.5.5)
    Chip.tsx                  der Statuschip — eigenes Markup, kein antd-`Tag` (§6.6.3)
    Gate.tsx  Entnahme.tsx  CheckFlow.tsx  Stepper.tsx  BarcodeScanner.tsx  ArtikelSuche.tsx
    Filterleiste.tsx          Trefferanzeige „X von Y", nur bei gezeigt !== gesamt (§5.13.3)
    useUrlFilter.ts           "use client": router.replace, committedQ-Ref, 300-ms-Debounce
                              (§5.14.1). Liegt hier und NICHT in _lib/, weil es `useRouter` ruft
                              und damit ein Client-Modul sein MUSS — die _lib/-Regel bleibt hart.
    helfer.module.css         KEINE Media Query (§7.7.1)
    verwaltung.module.css     die --lb-* und --lb-ampel-* Variablen beider Modi, Chip, KPI-Kante,
                              Brotkrume (§6.6.2a, §6.6.6, §6.8.4). Im Regelfall KEINE Media Query;
                              falls nötig: max-width ausschliesslich mit 767.98 (§7.7.1, §6.8.6)

  page.tsx                    DAS GATE — die EINZIGE Datei, die auf /m/lagerbuch auflöst
  t/[code]/route.ts           Token-Einlösung. Route Handler: KEIN Layout darüber (§2.7)
  abmelden/route.ts           räumt das Helfer-Cookie und antwortet 303 ans Gate. Der EINZIGE
                              Weg, auf dem ein totes Cookie unfreiwillig verschwindet — eine
                              Server Component darf keins löschen (§3.4.4)
  g/[code]/page.tsx           Barcode-Deep-Link — ROLLEN-WEICHE. Alle Trefferfälle leiten weiter;
                              der EINZIGE gerenderte Ausgang ist der Fehlerzustand aus 8-C2, und
                              der trägt den VerwaltungsRahmen (§2.9, §8.1, §11.3)
  a/[artikelId]/page.tsx      Regaletikett-Deep-Link — ROLLEN-WEICHE, wählt ihren Rahmen selbst
  manifest.webmanifest/route.ts   pwa-icon.svg/route.ts   icon-192.png/route.ts
  icon-512.png/route.ts       icon-maskable-512.png/route.ts                      (§7.10.2)

  helfer/
    layout.tsx                requireLagerbuchHost + requireHelferSitzung — NUR der Riegel,
                              KEIN Rahmen (der wandert in die Seiten, §7.8.2)
    page.tsx                  Entnahme            (HelferRahmen aktiv="entnahme")
    check/page.tsx            Fahrzeug-Check      (HelferRahmen aktiv="check")

  verwaltung/
    (arbeit)/
      layout.tsx              requireLagerbuchHost + requireLagerbuchAdmin + VerwaltungsRahmen
      page.tsx                Übersicht             → /verwaltung
      artikel/page.tsx        verfall/page.tsx      fahrzeuge/page.tsx  fahrzeuge/[id]/page.tsx
      vorlagen/page.tsx       vorlagen/[id]/page.tsx
      checks/page.tsx         checks/[id]/page.tsx
      bz/page.tsx             bz/scan/page.tsx      bz/[id]/page.tsx    bz/[id]/kontrolle/page.tsx
      sauerstoff/page.tsx     sauerstoff/[id]/page.tsx
      geraete/page.tsx        geraete/scan/page.tsx geraete/[id]/page.tsx
      bestellung/page.tsx     inventur/page.tsx     journal/page.tsx
      tokens/page.tsx         import/page.tsx                            — 23 Seiten
    (druck)/                  ⚠️ es darf KEIN verwaltung/(arbeit)/etiketten/ geben (§2.1 e, §8.4)
      layout.tsx              requireLagerbuchHost + requireLagerbuchAdmin, KEIN Shell (§2.9)
      druck.css               @page + @media print, Klassen mit `lb-`-Präfix, gilt NUR hier (§8.4)
      etiketten/page.tsx      Server Component: lädt Daten, erzeugt QR    → /verwaltung/etiketten
      etiketten/EtikettenBogen.tsx   "use client": Auswahl-State + window.print() (§8.4)
      etiketten/druck.test.ts       Quelltext-Scan über druck.css: @page und .lb-nichtDrucken
                                    stehen da, `body *` NICHT (§8.5)
  error.tsx                   Modul-Fehlergrenze (§11.2)
```

Acht Festlegungen, die aus diesem Baum folgen und nicht Geschmack sind:

**a) `_`-Ordner sind Next Private Folders und erzeugen keine Routen.** `_db/`, `_lib/`, `_actions/`
und `_ui/` liegen deshalb neben den Routen, nicht darunter. **`_actions/` weicht bewusst von `files`
ab**, das seine Actions in `(verwaltung)/actions.ts` führt: lagerbuchs Actions bedienen **beide**
Zugriffsklassen — 44 Actions, teils hinter `requireLagerbuchAdmin`, teils hinter
`requireHelferSchreibend` — und gehören damit zu keiner Route-Group. Der Nebeneffekt ist der
eigentliche Gewinn: der geschuldete Nachweis „44 von 44 tragen einen Guard" (§3.8.2) wird zu einem
Verzeichnisdurchlauf und damit zu einem Test statt zu einer Durchsicht. ⚠️ **Der Typ
`HelferErgebnis` liegt deshalb NICHT unter `_actions/`, sondern in `_lib/actionTypen.ts`** — sonst
liest der Guard-Scan eine Datei ohne Actions und braucht dafür eine Ausnahme.

**Die Abbildung Alt→Neu, Modul für Modul.** Sie ist die Liste, gegen die `_actions/guards.test.ts`
zählt; ohne sie ist „44 von 44" eine Absichtserklärung. Nachgezählt am eingefrorenen Bestand
(`lagerbuch` @ `ca04eb1`): **16 Dateien** unter `src/actions/` tragen `"use server"`, zusammen
**44 exportierte Funktionen** — und **alle 44 tragen heute schon einen Riegel als erste Anweisung**
(`await requireAdmin()` bzw. `await requireHelfer(db)`, je Funktion nachgesehen). Der Port setzt also
keine fehlenden Guards, er übersetzt vorhandene.

| Alt (`lagerbuch/src/actions/`) | Neu (`_actions/`) | n | Exporte | Riegel im Ziel |
|---|---|---|---|---|
| `artikel.ts` | `artikel.ts` | 3 | `createArtikel` · `updateArtikel` · `setArtikelAktiv` | `requireLagerbuchAdmin` |
| `aussondern.ts` | `aussondern.ts` | 1 | `aussondern` | `requireLagerbuchAdmin` |
| `bestellung.ts` | `bestellung.ts` | 1 | `markiereBestellt` | `requireLagerbuchAdmin` |
| `buchung.ts` | `buchung.ts` | 3 | `bucheZugang` · `bucheEntnahme` · `bucheEntnahmeHelfer` | die ersten zwei `requireLagerbuchAdmin`; `bucheEntnahmeHelfer` **`requireHelferSchreibend`** (heute `requireHelfer(db)`, `buchung.ts:83`) |
| `bz.ts` | `bz.ts` | 4 | `geraetSpeichern` · `setGeraetAktiv` · `geraetZuBarcode` · `kontrolleErfassen` | `requireLagerbuchAdmin` |
| `check.ts` | `check.ts` | 1 | `checkAbschluss` | **`requireHelferSchreibend`** (heute `requireHelfer(db)`, `check.ts:73`) |
| `csv.ts` | `csv.ts` | 1 | `importArtikelCsv` | `requireLagerbuchAdmin` |
| `detail.ts` | `detail.ts` | 1 | `getDetail` (dazu **drei `export type`**, die keine Actions sind) | `requireLagerbuchAdmin` |
| `fahrzeuge.ts` | `fahrzeuge.ts` | 5 | `createFahrzeug` · `setFahrzeugAktiv` · `sollPositionSetzen` · `sollPositionEntfernen` · `sollPositionWiederherstellen` | `requireLagerbuchAdmin` |
| `geraete.ts` | `geraete.ts` | 3 | `geraetSpeichern` · `setGeraetAktiv` · `geraetZuBarcode` | `requireLagerbuchAdmin` |
| `inventur.ts` | `inventur.ts` | 1 | `inventurKorrektur` | `requireLagerbuchAdmin` |
| `lagerort-verfall.ts` | **`lagerortVerfall.ts`** | 1 | `verfallSetzen` (§5.6.2, `lagerort-verfall.ts:37`) | `requireLagerbuchAdmin` |
| `loeschen.ts` | `loeschen.ts` | 3 | `pruefeLoeschbar` · `loescheElement` · `deaktiviereElement` | `requireLagerbuchAdmin` |
| `sauerstoff.ts` | `sauerstoff.ts` | 3 | `flascheSpeichern` · `setFlascheAktiv` · `messungErfassen` | `requireLagerbuchAdmin` |
| `templates.ts` | `templates.ts` | 11 | `createTemplate` · `renameTemplate` · `setTemplateAktiv` · `deleteTemplate` · `templatePositionSetzen` · `templatePositionEntfernen` · `fahrzeugTemplateZuweisen` · `fahrzeugTemplateSync` · `templateAufFahrzeugeSyncen` · `fahrzeugTemplateLoesen` · `templateAusFahrzeug` | `requireLagerbuchAdmin` |
| `tokens.ts` | `tokens.ts` | 2 | `createToken` · `setTokenAktiv` | `requireLagerbuchAdmin` |
| — (neu, §3.4, §7.2.3) | `gate.ts` | 1 | `einloesenAmGate` | **Ausnahmeliste, Eintrag 1** (§3.8.2) |
| — (neu, §7.4.4, §7.2.5) | `sitzung.ts` | 2 | `erneuereSitzung` · `beenden` | **Ausnahmeliste, Einträge 2 und 3** (§3.8.2) |
| **16 Alt-Dateien** | **18 Action-Dateien** | **47** | | **44 mit Guard + 3 Ausnahmen** |

**Vier Dinge, die diese Tabelle festhält, weil `guards.test.ts` sonst falsch zählt:**

1. **47, nicht 44 — und der Ordner hat 19 Dateien.** 44 ist die Zahl der **portierten** und zugleich
   der **bewachten** Actions; die drei Ausnahmen kommen hinzu. Ein Scan, der `toHaveLength(44)`
   behauptet, ist am ersten Tag rot. Und `ls _actions/` zeigt 19 Einträge: die 18 Action-Dateien plus
   `guards.test.ts`, das der Scan selbst überspringt.
2. **Es gibt drei Namensdubletten.** `geraetSpeichern`, `setGeraetAktiv` und `geraetZuBarcode` stehen
   **sowohl** in `bz.ts` **als auch** in `geraete.ts` — gleicher Name, verschiedene Tabellen
   (`bz_geraete` gegen `geraete`) und verschiedene Felder (`bz.ts:12-24` trägt Streifen-Lot und zwei
   Messlevel, `geraete.ts:13-23` MTK- und Ablaufdatum). Ein Scan, der die Exportnamen in ein `Set`
   legt, zählt **41** statt 44. Gezählt wird **je Datei je Deklaration**. ⚠️ Die beiden Dateien werden
   **nicht** zusammengelegt.
3. **`export type` ist keine Action.** `detail.ts` exportiert neben `getDetail` drei Typen
   (`ArtikelDetailCharge`, `ArtikelDetailBuchung`, `ArtikelDetailResult` — `detail.ts:9,18,26`). Der
   Scan muss `export type` und `export interface` verwerfen, sonst liest er drei ungeschützte Actions,
   die keine sind. Es ist dieselbe Unterscheidung, die oben `_lib/actionTypen.ts` aus dem Ordner
   heraushält — nur innerhalb einer Datei.
4. **Drei der 44 lesen nur und bleiben trotzdem Actions.** `getDetail`, `pruefeLoeschbar` und
   `geraetZuBarcode` (zweimal) stehen hier und **nicht** unter `_lib/lesepfade/` (§2.1 h), weil ihr
   einziger Aufrufer jeweils eine Client-Insel ist: `verwaltung/(admin)/artikel/ArtikelDrawer.tsx:11,42`,
   `components/LoeschDialog.tsx:5,31`, `verwaltung/(admin)/geraete/scan/GeraetScanner.tsx:3,8` und
   `verwaltung/(admin)/bz/scan/GeraetScanner.tsx:3,8` — alle vier mit `"use client"` in Zeile 1. Ein
   Client-Modul kann serverseitigen Lesecode nicht importieren; **die Action ist der Übergang.** Ihr
   Rumpf ruft nach dem Port den passenden Lesepfad und tut sonst nichts.

**Ein `chargen.ts` gibt es nicht.** Im Bestand trägt keine Action-Datei diesen Namen, und kein Kapitel
dieser Spec beschreibt eine: Chargen entstehen ausschließlich als Nebenwirkung von Zugang, Inventur
und CSV-Import (§5.3, §5.9). Der Eintrag war ein Schreibfehler und ist gestrichen.

**b) Es gibt genau eine Datei, die auf `/m/lagerbuch` auflöst — `page.tsx`, das Gate.** Route-Groups
erscheinen in keinem URL-Pfad; eine zusätzliche `(oeffentlich)/page.tsx` löste auf denselben Pfad
auf, und `next build` bricht mit „You cannot have two parallel pages that resolve to the same path"
ab. Aus demselben Grund hat `feedback` kein `src/app/m/feedback/page.tsx` neben `(admin)/page.tsx`,
und `files` keine `(verwaltung)/page.tsx` neben seinem Rollen-Verteiler
(`src/app/m/files/page.tsx`, Kopfkommentar). `verwaltung/(arbeit)/page.tsx` kollidiert **nicht** — sie
löst auf `/m/lagerbuch/verwaltung` auf.

**c) `/a` und `/g` liegen außerhalb jeder Route-Group, und das ist der wichtigste Schnitt im Baum.**
Beide sind **Rollen-Weichen**, keine Seiten einer Klasse. `src/app/a/[artikelId]/page.tsx:12-23`
entscheidet dreifach: mit Helfer-Sitzung das Detail, ohne sie aber mit Admin-Sitzung
`redirect("/verwaltung/artikel?a=…")` (`:18`), sonst das Gate mit `returnTo` (`:19`).
`src/app/g/[code]/page.tsx:19-26` hat dieselbe Form, mit umgekehrtem Vorzeichen: dort ist der
**Admin** der Zielbenutzer (`:21`), Helfer werden nach `/helfer` geschickt (`:24`), Sitzungslose aufs
Gate (`:25`). Legte man `/a` unter ein `helfer/layout.tsx`, das die Helfer-Sitzung hart verlangt,
wäre der Admin-Zweig tot; legte man `/g` unter einen chrome-losen öffentlichen Rahmen, stände ein
Verwaltender ohne Shell und ohne Rückweg da. Beide Dateien wählen ihren Rahmen deshalb **je Zweig
selbst** — strukturell dieselbe Bauform wie der Rollen-Verteiler von `files`, und aus demselben
Grund: sie müssen mehr als eine Klasse bedienen. Der Host-Riegel steht dafür in **jeder** der
beiden Dateien als erste Anweisung (§2.6).

⚠️ **„Je Zweig selbst" heißt bei den beiden nicht dasselbe — und das ist entschieden, nicht offen.**
`/a` rendert zwei Zustände, beide für eine **Helferin**: das Artikeldetail und die Meldung aus 8-C.
Beides öffentliche Ansichtsklasse, also `HelferRahmen` bzw. `OeffentlicherRahmen`, **kein antd**.
`/g` rendert dagegen **überhaupt nur einen** Zustand: die Trefferfälle leiten weiter
(`src/app/g/[code]/page.tsx:30`, `:32`), die Rollen-Weiche schickt jede Nicht-Admin-Anfrage vorher
weg (`:21-26`), übrig bleibt der 8-C2-Zustand für eine angemeldete verwaltende Person. Er trägt
deshalb `_ui/VerwaltungsRahmen.tsx` — **dieselbe** Komponente, die `verwaltung/(arbeit)/layout.tsx`
mountet, mit **zwei** Importeuren genau wie bei `files` (`m/files/page.tsx:80` gegen
`m/files/(verwaltung)/layout.tsx:48`; Kopfkommentar `m/files/_ui/VerwaltungsRahmen.tsx:12`: „EINE
STELLE, ZWEI IMPORTEURE"). Die Begründung und die Abgrenzung gegen einen dritten, shell-losen
Rahmen stehen in §2.9; dass Auflage 1 (§6.15) davon unberührt bleibt, weil sie **Layouts** verbietet
und diese Datei ein Blatt ist, ebenfalls.

**d) `verwaltung/` hat kein eigenes `layout.tsx`, und das ist Absicht.** Der Riegel liegt in einer
aufrufbaren Funktion, die **beide** Group-Layouts rufen — nicht in einem gemeinsamen Vorfahren.
Grund ist Falle 17: heute trägt der Edge-Cordon den Riegel vor dem Rendern, das `(admin)`-Layout ist
ausdrücklich nur Doppelabsicherung (`src/app/verwaltung/(admin)/layout.tsx:8`). Fällt die
Middleware weg, bleibt das Layout als einziger Riegel — und **Route-Group-Grenzen sind keine
Sicherheitsgrenzen**. Das Alt-Verzeichnis belegt, dass diese Grenze schon einmal überschritten
wurde: unter `src/app/verwaltung/` liegen `(admin)` und `kein-zugriff`, es gibt **kein**
`src/app/verwaltung/layout.tsx`, und `kein-zugriff/page.tsx` hängt damit nur am Root-Layout. Die
Suite hat die Lösung erprobt: `requireFeedbackAccess` liegt genau deshalb als Funktion vor
(`m/feedback/_lib/requireFeedbackAccess.ts:10` — „EINE Stelle, zwei Layouts", weil die Druckansicht
des Aushangs ein Layout ohne Shell braucht und damit aus dem Schutz des `(admin)`-Layouts herausfiel).

**e) `(druck)` steht von Anfang an im Baum, nicht später.** `/verwaltung/etiketten` druckt die
Token-Codes **im Klartext** (`src/db/etiketten.ts:19,23` — das Secret selbst) und braucht ein Layout
ohne Suite-Shell (§2.9, §8.4). Genau diese Datei ist es, die den Riegel später aus dem Group-Layout
herausfallen ließe; sie jetzt im Baum zu führen kostet nichts und macht die Zusage „beide
Group-Layouts rufen dieselbe Funktion" prüfbar, statt sie in einen späteren Commit zu verschieben.
⚠️ **Es darf kein `verwaltung/(arbeit)/etiketten/` geben** — zwei Route-Groups dürfen denselben
aufgelösten Pfad nicht doppelt belegen (§8.4).

**f) `src/app/m/lagerbuch/layout.tsx` existiert, trägt aber ausschließlich `metadata.manifest`.**
Das ist die eine Ausnahme zu §2.8s Regel „kein Modul-Layout": ein *Riegel* dort wäre falsch (er
umschlösse weder `/t` noch könnte er zwischen Helfer- und Verwaltungsklasse unterscheiden), ein
*Metadaten-Export* dort ist zwingend — steht der Manifest-Verweis im Root-Layout, bewirbt **jeder**
Suite-Host eine Lagerbuch-PWA (Falle 56). Die Datei rendert `{children}` und sonst nichts:
**keine `Shell`**, kein Rahmen, kein `viewport`-Export (den erbt sie von der Suite, §7.7.2).

**g) Zwei Pfadformen, zwei gegenläufige Konventionen — und sie stehen in denselben Dateien.**
Der Rewrite `<host>/<pfad>` → `/m/lagerbuch/<pfad>` (`core/routing.ts:78-79`) erzeugt einen
**äußeren** und einen **inneren** Pfad. Verbindlich:

| Was | Welche Form | Beleg |
|---|---|---|
| alles, was der **Client** an Pfaden schreibt oder vergleicht (`href` in `_lib/nav.ts`, `router.replace`, `window.location.assign`), und jedes `Location` einer Weiterleitung | **äußere** Form (`/verwaltung/artikel`) | `usePathname()` liefert den äußeren Pfad — **nachgemessen**, nicht angenommen: `data-pfad` am `modulnav`, `curl` gegen `qr.localtest.me` unter Next 16.2.6, `/` → `/`, `/wifi` → `/wifi` (`core/shell/SuiteNav.tsx:88-95`) |
| jedes `revalidatePath(...)` | **innere** Form (`/m/lagerbuch/verwaltung/artikel`) | Falle 49: alle 61 Aufrufe im Bestand übergeben heute den äußeren Pfad; unter der Suite ist das der falsche (§7.9.5) |

Die Messung hat zwei Ränder und die gehören dazugesagt: sie steht gegen Next **16.2.6**
(`SuiteNav.tsx:92`), die Suite fährt **16.2.11**, und sie entstand per `curl` gegen den Dev-Server
ohne Reverse-Proxy davor. Deshalb schuldet das Testkapitel hierfür einen E2E, nicht nur einen
Quelltext-Scan: `pnpm typecheck`, `pnpm build` und Vitest sind an dieser Naht dreifach blind — jede
dieser Stellen ist ein typkorrekter String-Vergleich, und `SuiteNav.test.tsx:48` mockt
`usePathname` und sagt das über sich selbst (`:263-266`). **Im Modul selbst kommt `usePathname`
überhaupt nicht vor** (§7.8.2) — die Aktivmarkierung kommt als Server-Prop.

**h) `_db/` hält keine Fachabfrage — weder lesend noch schreibend.** Das ist die Regel, die die zwei
Heimaten für Lesecode auflöst; ohne sie stünde derselbe Lesepfad plausibel an zwei Orten.

Unter `_db/` liegt genau das, was die **Tabellen definiert** oder die **Verbindung herstellt**:
`schema.ts`, `client.ts`, `drizzle.config.ts`, `migrations/`. Dazu **zwei** tabellennahe Auflöser,
und der Grund für die Ausnahme ist bei beiden derselbe — sie kennen **keine Seite**, sondern nur eine
Zeilenform, und jeder Lesepfad benutzt sie: `quelle.ts` (`quelleAufloeser`, Kennung → Klarname,
§4.13) und `etiketten.ts` (`etikettenDaten(db)`, §8.4). Wächst dort etwas heran, das eine Seite
kennt, ist es am falschen Ort.

**Jede Abfrage, die eine Seite bedient, liegt unter `_lib/lesepfade/`; jeder Schreibweg unter
`_lib/schreibpfade/`.** Die Symmetrie ist der Prüfstein: `src/db/abbuchung.ts`, `korrektur.ts`,
`umlagerung.ts`, `template-sync.ts` und `lagerort-verfall.ts` wandern in diesem Baum bereits nach
`_lib/schreibpfade/` — dann gehören die 37 Exporte aus `src/db/queries.ts` nach `_lib/lesepfade/`,
verteilt auf die zehn dort genannten Dateien. **Es gibt deshalb kein `_db/queries.ts`.**
⚠️ „Ist SQL" ist ausdrücklich **nicht** das Kriterium: die vier aggregierenden Abfragen aus
Entscheidung 7 (b) liegen nach §5.2.4 in `_lib/lesepfade/bestand.ts`, nicht in `_db/`.

⚠️ **Die Testdateien folgen einer anderen Achse, und das ist Absicht.** `_db/*.test.ts` sind nach
**Laufart** gruppiert, nicht nach Prüfling: dort steht, was gegen eine **echte SQLite-Datei** läuft —
§5.19.2 nennt neun davon einzeln, `_db/quelle.test.ts` ist die zehnte und ihre Aussagen gehören
§4.16 Punkt 4 —, auch wenn der Prüfling unter `_lib/lesepfade/` liegt. `queries.test.ts` ist
folgerichtig keine von ihnen; §4.16 Punkt 4 nennt die vier Dateien, denen seine fünf Aussagen
wirklich gehören.

### 2.2 Das Registrierungs-Dreieck

Drei zusammenpassende Einträge, per Test gekoppelt — fehlt der dritte, läuft es lokal und bricht im
Container (`CLAUDE.md:50-54`):

1. **`_db/`-Ordner** unter `src/app/m/lagerbuch/` mit `migrations/` und `migrations/meta/_journal.json`.
2. **`MODULE_MIGRATIONS`-Eintrag** in `src/core/bootstrap.ts:18-27`:

   ```ts
   { key: "lagerbuch", migrationsFolder: "src/app/m/lagerbuch/_db/migrations" },
   ```

3. **`COPY`-Zeile** im `Dockerfile` neben `:40-43`:

   ```dockerfile
   COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/lagerbuch/_db/migrations ./src/app/m/lagerbuch/_db/migrations
   ```

Die Kopplung ist real und CI-bewacht: `src/core/bootstrap.test.ts:82-107` prüft drei Dinge — jedes
Modul mit `_db/` steht in `MODULE_MIGRATIONS` (`:85`), jeder Ordner hat ein `meta/_journal.json`
(`:93`), und **jeder Ordner wird ins Prod-Image kopiert** (`:100-106`, ein `toContain` auf den
Dockerfile-Text). Das ist das dritte Bein, für das lagerbuchs eigene CI nichts hat. Der
Migrationspfad ist **cwd-relativ** (Dev = Repo-Root, Prod = `/app`, `bootstrap.ts:16-17`) — deshalb
ist der Zielpfad im `COPY` derselbe String wie im `MODULE_MIGRATIONS`-Eintrag.

**Und sechs Einträge, die still scheitern und deshalb auf dieselbe Checkliste gehören:**

4. **Registry-Eintrag** in `src/core/registry.ts` `MODULES` (§2.3). Ohne ihn wirft
   `getModule("lagerbuch")`, `moduleForHost` findet den Host nie, und `/api/health/lagerbuch`
   existiert nicht.
5. **`ICONS`-Map-Eintrag** in `src/core/shell/icons.ts:131-140`. Ein Name, der bloß eine gültige
   `@ant-design/icons`-Komponente ist, aber in der Map **fehlt**, fällt **still** auf
   `AppstoreOutlined` zurück — das Modul wäre in Kopfzeile und Drawer jeder Suite-Seite vom Portal
   nicht zu unterscheiden. Genau so ist es `files` am 30.07. passiert. Seither prüft
   `SuiteNav.test.tsx` die Map gegen die echte `MODULES`-Liste, ein vergessener Eintrag ist also ein
   **roter Test** statt eines falschen Bildes. `ContainerOutlined` existiert
   (`node_modules/@ant-design/icons/es/icons/ContainerOutlined.js`, gemessen 03.08.2026) und muss in
   den Importblock **und** in die Map.
6. **Kein Schema-Import und kein Seed in `core/bootstrap.ts`.** `migrateAllModules()` migriert
   schema-frei (`bootstrap.ts:54-59`), einziger Konsument der Schema-Importe ist `seedAllModules()`
   (`:80-84`) — ein Import wäre toter Code. `bootstrap.ts:22-25` schreibt das für `files` bereits
   aus. **Für lagerbuch kommt ein zweiter, härterer Grund dazu:** `seedAllModules()` ist die einzige
   Stelle im `core`, die `getModuleDb(<key>, schema)` ruft. Bliebe lagerbuch dort stehen, öffnete
   `core` eine Verbindung **ohne** die registrierte SQLite-Funktion `lb_falte` — der Fehler wäre ein
   `no such function: lb_falte` auf genau einem Codepfad (§5.13.2). `ensureHandlager` gehört ohnehin
   nicht hierher: es ist eine **Migrationszeile** (`0003_handlager.sql`, §4.3), keine Testdatenzeile.
   Die beiden aktiven E2E-Token-Codes ebenso wenig — sie gehen in einen eigenen Schritt der
   `webServer.command`-Kette (`pnpm exec tsx e2e/seed-lagerbuch.ts && …`, §12.6).
7. **`startBackgroundWork()`** (`bootstrap.ts:76-78`) hat **keinen** Umgebungsriegel; das Hausmuster
   legt ihn ins Modul (`m/files/_lib/boot.ts`). Ob lagerbuch dort überhaupt einen Eintrag bekommt,
   entscheidet der Betreiber mit Entscheidung 22 (Backup-Job, §15.1 Nr. 4). Der Baum hält den Platz frei; er
   bleibt leer, solange 22 nicht (b) wählt (§10.7).
8. **`iuk-suite/package.json`**: die vier Laufzeit-Abhängigkeiten (§1.2, Punkt 10). Der Lockfile
   wird dabei von **pnpm 11.0.9** geschrieben, nicht von 11.10.0 — und **keine** Dockerfile-Zeile aus
   lagerbuch darf mitwandern: `RUN corepack enable` (`lagerbuch/Dockerfile:4`) bricht auf Node 26 mit
   exit 127 ab, die offiziellen Images bündeln corepack seit Node 25 nicht mehr. Die Suite hat genau
   das schon gefressen (`iuk-suite/Dockerfile:3-8`).
9. **Die Einhängung von `lagerbuchBootFehler()` in `assertHostConfig()`** (`core/bootstrap.ts:40-49`).
   ⚠️ **Das ist eine Änderung an einer `core`-Datei** — die zweite in dieser Liste nach `icons.ts`
   (Punkt 5), und insgesamt die dritte des Vorhabens: `.modulnav` in `core/shell/shell.module.css`
   kommt aus §6.3.2 dazu (Anhang, Arbeit 4). Sie braucht denselben eigenen Commit. Zwei Zeilen: der Import neben `bootstrap.ts:13` und ein
   `...(await lagerbuchBootFehler()),` im Fehler-Array (`:42-46`), genau dort, wo `filesBootFehler()`
   seit dem files-Port steht (`:45`). **Ohne diesen Eintrag existiert `_lib/boot.ts`, wird aber nie
   gerufen — sämtliche sechs Boot-Prüfungen aus §10.5 laufen dann niemals, und nichts wird rot.**
   Genau die Klasse Fehler, für die diese Liste da ist.

   **Was das für portal, qr, feedback und files bedeutet — ausdrücklich, weil `core` allen gehört.**
   `assertHostConfig()` ist der gemeinsame Startriegel der **ganzen** Suite und wirft **einmal** mit
   der gesammelten Liste (`:47-49`). Daraus folgen drei Auflagen an das Modul, nicht an `core`:
   `lagerbuchBootFehler()` hat die Signatur **`(): Promise<string[]>`** und **wirft nie** — ein Wurf
   ersetzte die gesammelte, lesbare Meldung durch einen Stacktrace und nähme die vier laufenden
   Module mit; sie ist `async`, weil der Aufrufer bereits awaitet (`:45`, dieselbe Bauform wie
   `filesBootFehler()`); und sie liefert **nur dann** Einträge, wenn
   `prodHostsFor(getModule("lagerbuch")).length > 0` — die Bedingung aus §10.5, die verhindert, dass
   ein Image mit lagerbuch den Start der übrigen vier blockiert, bevor die `.env` ergänzt ist.

   ⚠️ **Und für diese Naht gibt es kein Kopplungsnetz.** Das Migrations-Dreieck oben hat eines
   (`bootstrap.test.ts:82-107`); die Boot-Haken haben keines: `bootstrap.test.ts:143-263` prüft
   ausschließlich die sechs Prüfungen von `files`, `:288-293` scannt nur die Reihenfolge in
   `instrumentation.ts`. **Kein Test behauptet „jedes Modul mit `_lib/boot.ts` steht in
   `assertHostConfig`".** Deshalb steht dieser Punkt auf der Checkliste und nicht in einer Fußnote.

### 2.3 Registry-Eintrag

```ts
// lagerbuch: EIN Host (lagerbuch.iuk-ue.de), aber die Domain steht ausschliesslich
// in SUITE_HOST_LAGERBUCH — Betreiberauflage vom 03.08.2026 („zu 100 % konfigurierbar").
// prodHosts bleibt deshalb leer, wie bei qr, feedback und files.
//
// requiresAuth MUSS false bleiben: /t/<code> ist der einzige Weg in die
// Helfer-Sitzung und wird OHNE jede Sitzung aufgerufen, /g/<code> entscheidet
// seine Rolle selbst, und das Gate auf / ist der Einstieg beider. Mit
// requiresAuth: true schickt decideRoute (routing.ts:71-73) jeden anonymen
// Aufruf in den Login — und zwar sofort beim Cutover, fuer jedes gedruckte
// Etikett gleichzeitig.
// Dadurch liest canAccess() requiredGroups hier NIE (frueher Ausstieg bei
// !requiresAuth, registry.ts:155). Durchgesetzt wird der Verwaltungszugang
// modul-intern in _lib/zugang.ts, der Host in _lib/host.ts.
{ key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", shell: "full",
  requiresAuth: false, requiredGroups: [], adminGroups: ["lagerbuch-admin"],
  prodHosts: [], showInSwitcher: true },
```

Feld für Feld:

- **`requiresAuth: false` — zwingend, nicht bequem.** Vier Pfade belegen es:
  `src/app/t/[code]/route.ts:11` wird ohne jede Sitzung aufgerufen (es *erzeugt* die Sitzung);
  `src/app/g/[code]/page.tsx:21-26` entscheidet seine Rolle selbst; das Gate auf `/` ist der
  Einstieg beider; und `/a/:path*` steht zwar in lagerbuchs eigenem Matcher, ist aber modulintern
  geschützt. **Die Folge muss man mitdenken:** `canAccess` steigt bei `!requiresAuth` sofort mit
  `true` aus (`core/registry.ts:155`) und liest `requiredGroups` dann **nie**. Der
  Verwaltungsriegel muss modulintern sitzen (§2.5), und der Host-Riegel ebenso (§2.6). Das ist
  genau die Konstellation, für die `feedback` und `files` ihre Backstops haben.
- **`requiredGroups: []` — und diese Liste bleibt leer.** Sie ist unter `requiresAuth: false`
  wirkungslos (siehe oben) und wird von `_lib/zugang.ts` **nicht** gelesen (§2.5). Sie steht hier
  ausschließlich, weil `ModuleDef` das Feld verlangt.
- **`adminGroups: ["lagerbuch-admin"]`** — derselbe Name, den lagerbuch heute als Vorgabe für
  `OIDC_ADMIN_GROUP` führt (`src/lib/config.ts:46`). ⚠️ **Annahme:** der produktive Wert stimmt mit
  der Vorgabe überein. Der tatsächliche Gruppenname ist Runbook-Eingabe; abweichend wird er über
  `SUITE_ADMIN_GROUP_LAGERBUCH` gesetzt, ohne Rebuild.
- **`prodHosts: []`** — vor dem Cutover hat das Modul keine Prod-Domain, dieselbe Lage wie bei `qr`,
  `feedback` und `files` (`registry.ts:51,67,89`). Der App-Switcher zeigt es dann nicht
  (`core/shell/switcherEntries.ts:10-14` verwirft Module, für die `moduleUrl` `null` liefert). Die
  Domain kommt ausschließlich aus `SUITE_HOST_LAGERBUCH`, weil `prodHostsFor` die Env vorziehen
  lässt (`registry.ts:123-125`) — das ist die Betreiberauflage „zu 100 % konfigurierbar", und sie
  ist damit **ohne einen einzigen Handgriff erfüllt**. ⚠️ **Was dadurch nicht konfigurierbar wird:
  die bereits gedruckten Etiketten.** Das Artikel-Regaletikett trägt **keinen** abtippbaren
  Identifikator — `EtikettenBogen.tsx:37` rendert Titel = `name`, Sub = `fach`, und `url` bekommt die
  Komponente nicht einmal als Prop (`:5-6`); die Adresse existiert auf dem Papier ausschließlich als
  Pixelmuster. Ein Domainwechsel macht jedes Regaletikett wertlos, und der Ausfall ist zusätzlich
  **still** — bis §8.1 (8-C) ihn behebt. Zugangs-Codes bleiben dagegen per Tastatur benutzbar — der
  Klartextweg über das Gate braucht nirgends einen Host (§8.1).
- **`icon: "ContainerOutlined"`** — siehe §2.2, Punkt 5. Der Name muss in `core/shell/icons.ts`
  stehen, nicht bloß bei antd existieren.
- **`shell: "full"`** gilt für die Verwaltung und ist **nur die Vorgabe**; welche Shell eine Route
  wirklich bekommt, entscheidet ihr Layout (§2.9). `files` fährt genauso: Registry `shell: "full"`,
  und die beiden `(oeffentlich-*)`-Layouts binden gar keine `Shell` ein.
- **`showInSwitcher: true`** — der Switcher rendert nur innerhalb der Shell, also nur im
  Verwaltungszweig; für eine Helferin ist er strukturell unerreichbar. Vor dem Cutover ist der
  Eintrag ohnehin unsichtbar (siehe `prodHosts`).

### 2.4 Wo `lagerbuch` in `MODULE_MIGRATIONS` und `MODULES` einsortiert wird

Ans Ende beider Listen, hinter `files`. `MODULE_MIGRATIONS` wird der Reihe nach abgearbeitet
(`bootstrap.ts:55-59`), und **ein Migrationsfehler in lagerbuch bricht den Start des ganzen
Containers ab** — also auch portal, qr, feedback und files (Falle 50). Das ist eine geerbte
Ausfallkopplung, keine neue: sie gilt für jedes Modul mit eigener DB. Sie gehört trotzdem
ausgeschrieben, weil lagerbuch mit sieben Bestandsmigrationen und handgeschriebenem Trigger-SQL das
bisher größte Migrationsrisiko der Suite mitbringt. Die Konsequenz fürs Runbook: die
Generalprobe migriert gegen eine **Kopie** des Produktionsstands, nicht gegen eine leere DB.

### 2.5 Zugriff — genau EINE Stufe, ohne Suite-Admin und ohne zweite Gruppenquelle

Der Betreiber hat am 03.08.2026 festgelegt: **der Suite-Admin bekommt keine Lagerbuch-Rechte.**
Lagerbuch-Admin ist ausschließlich, wer in `SUITE_ADMIN_GROUP_LAGERBUCH` steht — das `feedback`-
Muster, das `suiteAdminGroup` bewusst nicht mitliest. **Die Bauform von `istLagerbuchAdmin` und
`requireLagerbuchAdmin` steht vollständig in §3.6**; hier stehen nur die drei Eigenschaften, die den
*Baum* bestimmen, und die eine Boot-Zusage, die daran hängt.

**Damit weicht diese Spec bewusst von `isModuleAdmin` ab.** `core/groups.ts:104` lässt den
Suite-Admin unbedingt durch (`if (groups.includes(suiteAdminGroup(env))) return true;`), und der
Kurzschluss ist begründet (`:14`: „Ist überall Admin, damit ein Modul nicht aussperrbar ist"). Für
lagerbuch wiegt die Gegenseite schwerer: Admin heißt hier Bestand korrigieren, aussondern,
Zugangs-Codes ausstellen und sperren, das **Journal mit Klarnamen** lesen und Etiketten mit den
**Codes im Klartext** drucken. „Betrieb und Einsicht sind zwei Rollen" (Entscheidungs-Log 2026-07-28)
trägt hier mindestens so weit wie bei `feedback`. Vorbild ist `m/feedback/_lib/access.ts`, das genau
deshalb `adminGroupsFor(getModule(...))` liest und `suiteAdminGroup` **nicht**.

Drei Eigenschaften der Verknüpfung sind tragend, weil die naheliegende Vorlage jeweils die falsche
ist:

1. **`adminGroupsFor(mod)`, nie `mod.adminGroups`.** Der direkte Feldzugriff macht
   `SUITE_ADMIN_GROUP_LAGERBUCH` an genau dieser Stelle wirkungslos — dieselbe Falle, die
   `registry.ts:28-34` für `prodHosts` ausschreibt und die vor dem `feedback`-Cutover einmal
   zugeschlagen hat (`requireFeedbackAccess.ts:37-44`).
2. **Eine leere Liste gewährt NICHTS.** `viewer.groups.some(g => erlaubt.includes(g))` ist bei
   leerem `erlaubt` falsch. Das ist ausdrücklich **nicht** die Bauform von `canAccess`
   (`registry.ts:157-159`), die bei leerer Liste mit `true` aussteigt — `core/groups.ts:53-54` nennt
   das wörtlich „eine **ÖFFNUNG**". Wer die Verknüpfung von `canAccess` abschreibt, öffnet die
   Lagerbuch-Verwaltung für **jeden Eingeloggten**, und der Fehler ist still: alles funktioniert,
   für zu viele. Konkret heißt das: `SUITE_ADMIN_GROUP_LAGERBUCH=` (leer) sperrt **alle** aus dem
   Verwaltungszweig aus — das ist die richtige, restriktive Richtung, aber es ist eine
   Fehlkonfiguration ohne Rückweg außer einer `.env`-Änderung auf dem Server. **Deshalb prüft der
   Boot, dass die Variable gesetzt und nicht leer ist** (§10.5, Prüfung 5).
3. **`SUITE_ACCESS_GROUP_LAGERBUCH` ist für dieses Modul kein Schalter — und ein gesetzter Wert
   bricht den Boot ab.** `validateGroupConfig` (`core/groups.ts:120-142`) würde ihn akzeptieren,
   sobald `lagerbuch` in `MODULES` steht, und nur eine **leer** gesetzte Variable melden (`:137`).
   Ein nicht-leerer Wert wäre damit still wirkungslos — genau der Zustand, gegen den diese Prüfung
   angetreten ist. Abhilfe, nach dem Muster von `filesBootFehler` und eingehängt in dieselbe
   Fehlerliste (§10.5):

   ```ts
   // _lib/boot.ts — Auszug. Die vollständige Prüfliste steht in §10.5.
   const name = accessGroupEnvName("lagerbuch"); // SUITE_ACCESS_GROUP_LAGERBUCH
   if (env[name] !== undefined) {
     fehler.push(
       `${name} ist gesetzt, wirkt fuer lagerbuch aber NICHT: das Modul kennt genau eine ` +
       `Zugriffsstufe, und die liest ausschliesslich SUITE_ADMIN_GROUP_LAGERBUCH. ` +
       `Entweder die Zeile entfernen oder die Gruppe dorthin eintragen.`,
     );
   }
   ```

   Drei Zeilen, und sie schließen den einzigen Weg, auf dem jemand aus Analogie zu `feedback` eine
   zweite Gruppenquelle einführt, die niemand durchsetzt. **Das ist eine begründete Abweichung von
   der `files`-Verknüpfung** (§0.2, Nr. 1): `requireFilesAccess` vereinigt `adminGroupsFor(mod)` mit
   `requiredGroupsFor(mod)`, weil dort **beide** Variablen dieselbe eine Stufe gewähren. Hier wäre
   das eine stille zweite Tür — mit `requiredGroups: []` ließe ein aus `feedback` abgeschautes
   `SUITE_ACCESS_GROUP_LAGERBUCH` eine weitere Gruppe ins Journal mit Klarnamen und auf den
   Etikettenbogen mit den Klartext-Codes, ohne dass irgendwo etwas rot würde.

**Der Riegel selbst** heißt `requireLagerbuchAdmin()` und liegt in `_lib/zugang.ts`. §2 legt
ausschließlich fest, **wo** die Funktion gerufen wird (§2.8, Tabelle); Rumpf, `callbackUrl`,
`notFound()` statt 403 und der Verzeichnis-Upsert stehen in §3.6.

### 2.6 Host-Auflösung — der Riegel, den kein Gate findet (Falle 61)

**Der Befund.** `decideRoute` behandelt bereits interne Pfade gesondert
(`pathname.match(/^\/m\/([^/]+)(?:\/.*)?$/)`, `core/routing.ts:58`) und gatet danach nach dem **Modul
aus dem Segment**, nicht nach dem Host (`:59-66`, Begründung `:54-57`). Für ein Modul mit
`requiresAuth: false` steigt `canAccess` sofort mit `true` aus (`registry.ts:155`), der Zweig endet
also bei `{ action: "next" }` — gleichgültig, welcher Host gefragt hat. `proxy.ts:103` nimmt `/m/*`
bewusst **nicht** aus dem Matcher; das wäre ein Auth-Bypass. Folge: sobald lagerbuch das zwingende
`requiresAuth: false` bekommt, beantwortet **jeder** Host, der auf den Suite-Container terminiert,
`/m/lagerbuch/t/<code>`, `/m/lagerbuch/g/<code>`, `/m/lagerbuch/helfer/*` und
`/m/lagerbuch/verwaltung/*`.

*Kein Gate:* das Verhalten ist nicht bloß ungetestet, es ist **festgeschrieben** —
`core/routing.test.ts:61-65` prüft ausdrücklich, dass interne Pfade nach dem Segment gegatet
werden. `typecheck`, `lint` und `pnpm build` sehen nichts; Playwright fährt gegen genau **einen**
`baseURL` (Falle 57).

**Warum das für lagerbuch nicht kosmetisch ist.** Der Verwaltungsriegel aus §2.5 ist host-blind und
bleibt es — `/m/lagerbuch/verwaltung/*` ist auf einem fremden Host genauso gegatet wie auf der
eigenen Domain. Es ist **kein Autorisierungs-Bypass**. Teuer ist `/t/<code>`: davor steht allein das
Rate-Limit (`src/app/t/[code]/route.ts:25`), und `redeemToken` schreibt `lastUsedAt`
(`src/actions/token-redeem.ts:16`). **Zwei Folgen, beide mit Datenwirkung** — und die dritte, die
man hier erwartet, ist mit Entscheidung 8-F (§8.3) weggefallen; der Riegel trägt trotzdem, siehe
den Warnabsatz darunter:

1. **Die Token-Tabelle sagt danach etwas Falsches** — `TokenTable.tsx:67` zeigt „zuletzt
   <Zeitstempel>" statt „nie benutzt", für einen Code, den niemand benutzt hat. Nach 8-F ist das
   der einzige verbleibende Zweck der Spalte, und er wird hier still verfälscht.
2. **Das Cookie landet auf dem fremden Host.** `helferCookieOptionen()` führt kein `domain`
   (`src/lib/auth/helferSession.ts:31-34`), ist also host-only. Bleibt der Redirect relativ, läuft
   lagerbuch auf dem fremden Host **vollständig** — als zweite funktionierende Herkunft desselben
   Moduls, die in keinem Runbook steht und deren Sitzungen niemand sieht. **Das ist die Folge, die
   den Riegel allein trägt:** echte Buchungen in ein append-only Journal aus einer Herkunft, die
   niemand überwacht, sind nicht rückbaubar (§4.4).

⚠️ **Was hier NICHT mehr steht — und warum der Riegel trotzdem bleibt.** Bis Entscheidung 8-F stand
an erster Stelle „das Kärtchen wird unlöschbar": `pruefeToken` verweigert heute das Löschen jedes
Codes mit gesetztem `lastUsedAt` (`src/actions/loeschen.ts:89-99`), und ein einziger Aufruf auf dem
falschen Host machte aus einem nie ausgegebenen Kärtchen dauerhaft ein benutztes. **Nach 8-F (§8.3)
kann ein Token ohnehin nicht mehr gelöscht, sondern nur noch gesperrt werden** — die Folge entfällt
ersatzlos. Tragend war sie nie: die beiden verbleibenden reichen je für sich, und Folge 2 ist die
schwerste der ursprünglich drei. Wer den Riegel mit dem Argument streichen will, seine erste
Begründung sei weggefallen, streicht ihn gegen die falsche Begründung.

**Die Festlegung.** `lagerbuch` bekommt eine modul-eigene Host-Sperre nach dem produktiv laufenden
Muster von `files` (`m/files/_lib/hostRolle.ts:90-121`) — Entscheidung 10, Option (d), additiv zu
(a). Anders als `files` hat lagerbuch **eine** Rolle, also drei Funktionen statt sechs:

```ts
// _lib/host.ts — KEIN "use client". Server Components UND Route Handler lesen hier.
import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Ist das der Lagerbuch-Host? `moduleForHost(resolveHost(headers))?.key` und
 * NICHT ein direkter Vergleich gegen prodHostsFor:
 *
 * - `moduleForHost` (registry.ts:141-148) trifft `lagerbuch.localtest.me` VOR und
 *   UNABHAENGIG von prodHostsFor (`:144`) — nachgeprueft am Arbeitsbaum. Damit
 *   laeuft derselbe Code-Pfad in Dev, E2E und Produktion, OHNE dass
 *   SUITE_HOST_LAGERBUCH lokal gesetzt sein muss.
 * - `resolveHost` (routing.ts:36-41) wird WIEDERVERWENDET, nicht nachgebaut: seine
 *   Vorrangregel `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware
 *   die einzig richtige. Eine zweite Aufloesung waere der Ort, an dem beide
 *   auseinanderlaufen.
 *
 * ES GIBT KEINEN „kein Prod-Host konfiguriert -> durchlassen"-ZWEIG. Er waere die
 * Sperre, die sich selbst abschaltet: solange SUITE_HOST_LAGERBUCH fehlt, waere
 * genau der Zustand offen, gegen den die Datei gebaut ist. Die Praedikatsform
 * oben macht ihn ueberfluessig, weil sie den Dev-Host ohne jede Env deckt.
 */
export function istLagerbuchHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "lagerbuch";
}

/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft. Kein 403: die Existenz eines
 *  Pfades auf dem falschen Host wird nicht verraten (docs/design/README.md:237-242). */
export function requireLagerbuchHost(headers: Headers): void {
  if (!istLagerbuchHost(headers)) notFound();
}

/** Fuer ROUTE HANDLER. Wirft NIE — ein notFound() ist keine brauchbare Antwort auf
 *  einen gescannten QR-Code; der Handler baut seine 404 selbst. */
export function lagerbuchHostOderNull(headers: Headers): "lagerbuch" | null {
  return istLagerbuchHost(headers) ? "lagerbuch" : null;
}
```

**Die Zahl der Hosts ist hier anders geregelt als bei `files`, und das ist Absicht.** `files` bricht
den Boot bei einem Host ab, weil eine seiner zwei Rollen sonst keinen Host hätte. lagerbuch hat eine
Rolle, also:

| Hosts in `SUITE_HOST_LAGERBUCH` | Urteil | Begründung |
|---|---|---|
| 0 (nicht gesetzt oder leer) | **erlaubt** | Zustand vor dem Cutover bzw. „Cutover zurückgenommen". Es trifft dann nur `lagerbuch.localtest.me` — genau der Host, unter dem Dev und E2E laufen. ⚠️ **Annahme:** in Produktion ist das Modul in diesem Zustand nicht erreichbar, weil `SUITE_TRAEFIK_RULE` die Domain nicht führt. Das ist eine Betreiberangabe, keine Repo-Tatsache — die Erreichbarkeit steuert allein die Traefik-Regel, und sie steht nicht im Repo |
| 1 | **erlaubt** | der Normalfall nach dem Cutover: `lagerbuch.iuk-ue.de` |
| ≥ 2 | **erlaubt** | Entscheidung 16 (b) hält sich offen, eine abgelöste Domain dauerhaft als zweiten Host mitlaufen zu lassen, damit gedruckte Etiketten weiterleben. Ein zweiter Host wäre hier kein Fehlzustand, sondern eine Aussage. ⚠️ Die **Reihenfolge** ist dann bedeutungstragend: `moduleUrl` nimmt `prodHostsFor(mod)[0]` in die gedruckten Pixel (§8.1) |

Es gibt deshalb **kein** `validateLagerbuchHosts`. Tippfehler im Variablennamen, Protokoll oder Port
im Wert und doppelt vergebene Hosts fängt bereits `validateHostConfig` (`core/hosts.ts:65-100`).

⚠️ **Eine Auflage bleibt trotzdem, und sie hat zwei unabhängige Gründe:
`SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me` wird in der E2E-Konfiguration gesetzt**
(`webServer.env` in `iuk-suite/playwright.config.ts`). Erstens hängen die Zahlen-Boot-Prüfungen aus
§10.5 an `prodHostsFor(...).length > 0` und griffen sonst in keinem Testlauf; zweitens ist der
Zwei-Host-E2E aus §12.2 sonst nicht darstellbar. In der reinen Dev-Umgebung ist die Variable
**nicht** nötig — das Prädikat oben deckt `lagerbuch.localtest.me` von selbst.

**Verankerung — und die dritte Stelle vergisst man.** Route Handler haben **kein** Layout; die
Sperre erreicht sie über kein Group-Layout. Verbindlich:

| Stelle | Funktion | Warum |
|---|---|---|
| `verwaltung/(arbeit)/layout.tsx` | `requireLagerbuchHost` | 23 Seiten mit Journal, Bestand und Codes |
| `verwaltung/(druck)/layout.tsx` | `requireLagerbuchHost` | der Etikettenbogen mit Klartext-Codes |
| `helfer/layout.tsx` | `requireLagerbuchHost` | Entnahme und Fahrzeug-Check |
| `page.tsx` (Gate) | `requireLagerbuchHost` | liegt außerhalb jeder Group |
| `g/[code]/page.tsx`, `a/[artikelId]/page.tsx` | `requireLagerbuchHost` | Rollen-Weichen, außerhalb jeder Group (§2.1 c) |
| `t/[code]/route.ts` | `lagerbuchHostOderNull` → eigene 404 | **die Tür mit Datenwirkung**; ein Handler hat kein Layout |
| `abmelden/route.ts` | `lagerbuchHostOderNull` → eigene 404 | räumt das Helfer-Cookie (§3.4.4). Er existiert überhaupt nur, weil `cookies().delete()` in einer Server Component wirft — und erbt damit dieselbe Pflicht: ein Handler hat kein Layout |
| `manifest.webmanifest/route.ts` und die vier Icon-Handler | `lagerbuchHostOderNull` → eigene 404 | sonst bewirbt jeder Suite-Host eine Lagerbuch-PWA (Falle 56) |
| die Server Action des Gates (`einloesenAmGate`) | `requireLagerbuchHost` — **die werfende Form, und sie ist geprüft** | sie ruft `redeemToken` und schreibt damit **ebenfalls** `lastUsedAt`; ohne sie bliebe die zweite Hälfte derselben Tür offen. Dasselbe gilt für `erneuereSitzung` (§7.4.4). ⚠️ **Ausdrücklich NICHT `lagerbuchHostOderNull` → `{ok:false}`,** obwohl §7.3 für erwartbare Lagen Rückgabewerte vorschreibt: §7.3 nimmt den **Riegelfall** davon aus („nicht ‚erwartbar', sondern ‚manipuliert'"), §11.5 Zustand 22 hält den Wurf als Zustand fest, und `m/files/(verwaltung)/actions.ts:26-28` sagt denselben Satz für die Suite („Zugriffsverletzungen gehoeren NICHT dazu: `requireFilesAccess` wirft weiter"). Ein Mensch erreicht die Lage gar nicht: die Gate-**Seite** trägt `requireLagerbuchHost` (Zeile weiter oben), auf fremdem Host rendert sie nicht — dort kommt nur ein gescripteter POST mit bekannter Action-ID an. Ein eigener `grund`-Wert dafür wäre zudem eine Auskunft, die §3.9 bewusst nicht gibt. `lagerbuchHostOderNull` bleibt, was es ist: die Form für **Route Handler**, die ihre Antwort selbst bauen müssen (§3.2.1; `m/files/_lib/hostRolle.ts:28-32` schreibt die Arbeitsteilung aus) |
| `requireHelferSitzung()` / `requireHelferSchreibend()` selbst | rufen `requireLagerbuchHost` **intern** als erste Anweisung | siehe unten — das ist keine Bequemlichkeit, sondern die einzige Form, unter der die Regel darunter wahr ist |

**Für die Verwaltungs-Actions gilt: kein Host-Riegel, nur der Zugriffsriegel aus §2.5/§3.6.** Der ist
host-blind und vollständig, also ist eine Admin-Action auf fremdem Host kein
Autorisierungsproblem — sie verlangt dieselbe Gruppe wie auf der eigenen Domain.

**Für die Helfer-Actions gilt das nicht, und das ist der Grund für die letzte Zeile der Tabelle.**
`requireHelfer` (`src/actions/session.ts:22-28`) prüft Cookie-Signatur und `tokens.aktiv` und gibt
`{tokenId, code}` zurück — **keinen Host und keinen Lagerort**. Ein `helfer_session`-Cookie, das
über `/m/lagerbuch/t/<code>` auf einem fremden Suite-Host entstanden ist, liegt dort host-only
(`src/lib/auth/helferSession.ts:31-34`) und ist danach ein **vollgültiger Ausweis** für
`bucheEntnahmeHelfer` (`src/actions/buchung.ts:83`) und `checkAbschluss` (`src/actions/check.ts:73`)
auf genau diesem Host. Das wären echte Buchungen in ein append-only Journal aus einer Herkunft, die
in keinem Runbook steht und deren Sitzungen niemand sieht. **Deshalb rufen `requireHelferSitzung()`
und `requireHelferSchreibend()` den Host-Riegel selbst**, als erste Anweisung, vor jeder
Cookie-Prüfung: dann ist die Zusage „jede Helfer-Action ist host-gebunden" **durch Konstruktion**
wahr und nicht durch eine Liste, die die nächste Action vergisst. Es ist dieselbe Überlegung wie in
`files/(verwaltung)/layout.tsx` („erst der Host, dann die Person") — nur eine Ebene tiefer, weil hier
keine Layout-Ebene existiert, die alle betroffenen Stellen umschließt.

**Was dieser eine Riegel bezahlt.** Er steht in `t/[code]/route.ts` **vor** `redeemToken` und
schließt die Folgen aus Falle 61 in einem Zug: kein `lastUsedAt` auf einem fremden Host, also kein
falsches „zuletzt benutzt" in der Token-Tabelle (`TokenTable.tsx:67`); keine zweite, unbeobachtete
Herkunft, unter der eine Helfer-Sitzung entsteht und in das append-only Journal schreibt; und kein
Verbrauch des Gate-Budgets durch Aufrufe, die die Lagerbuch-Domain nie erreicht haben. ⚠️ **„Kein
unlöschbares Kärtchen" steht bewusst nicht mehr dabei:** nach Entscheidung 8-F (§8.3) ist ein Token
ohnehin nicht mehr löschbar, und ein Gewinn, den es nicht mehr gibt, darf einen Riegel nicht tragen.

### 2.7 Wo Route Handler liegen dürfen — und wo sie tot wären

`PASSTHROUGH = ["/api/auth", "/api/health", "/login", "/_next", "/favicon.ico", "/.well-known"]`
wird als **erstes** geprüft, vor jeder Host-Auflösung (`core/routing.ts:12,50-52`). Daraus vier
harte Regeln für diesen Port:

- **`src/app/api/health/route.ts` wird nicht portiert.** Eine Datei
  `src/app/m/lagerbuch/api/health/route.ts` wäre unter der Suite **tot** — kein Fehler, kein Log.
  Der Health-Weg des Moduls ist der generische `/api/health/lagerbuch`
  (`core/health/index.ts:4-16`: `getModule(key)`, Modul-DB öffnen, `SELECT 1`, schließen); er
  funktioniert von selbst, sobald `lagerbuch` in `MODULES` steht. ⚠️ Der Health-Check öffnet dabei
  eine **eigene**, sofort wieder geschlossene Verbindung über `openModuleDatabase` — sie kennt
  `lb_falte` nicht, braucht sie aber auch nicht (`SELECT 1`). ⚠️ **Und `<host>/api/health`
  antwortet nach dem Cutover trotzdem weiter `ok`** — die Suite beantwortet den Pfad, und die
  Antwort sagt nichts über lagerbuch (Falle 51). Ein Monitor, der auf der Lagerbuch-Domain diesen
  Pfad abfragt, ist danach ein grüner Balken ohne Aussage. Entscheidung 21 (a) gilt: `PASSTHROUGH`
  bleibt, und die Umstellung des Monitors ist eine Runbook-Zeile (§1.3).
- **`src/app/api/auth/[...nextauth]/route.ts` wird nicht portiert.** `/api/auth` gehört der Suite
  (`src/app/api/auth/[...nextauth]/route.ts`), und mit ihm die gesamte Auth.js-Konfiguration.
  lagerbuchs `src/auth.ts` und `src/auth.config.ts` entfallen ersatzlos. Zwei Verluste, die daran
  hängen: `pages: { error: "/verwaltung/kein-zugriff" }` (`src/auth.config.ts:72`) hat in der Suite
  **kein Gegenstück** — `core/auth/config.ts:93-95` setzt nur `signIn`, keinen `error`-Schlüssel —,
  und die `console.warn`-Zeile aus `src/auth.config.ts:94-99`, die bei abgelehntem Login
  ausschreibt, **welche** Gruppen im Token standen. Beides ist in §3.3 und §11.4 entschieden.
- **`/t/<code>` bleibt auf der Modul-Wurzelebene**, `src/app/m/lagerbuch/t/[code]/route.ts` — **nicht**
  unter `api/`. Der Pfad steht auf laminierten Kärtchen (1:1-Pflicht) und ist nicht in
  `PASSTHROUGH`; der Rewrite `<host>/t/<code>` → `/m/lagerbuch/t/<code>` (`routing.ts:78-79`)
  erreicht ihn. **Daneben, und bewusst NICHT unter `t/`: `src/app/m/lagerbuch/abmelden/route.ts`**
  (äußerer Pfad `/abmelden`, §3.4.4) — der einzige Ort, an dem ein totes Helfer-Cookie geräumt
  werden kann, weil eine Server Component das nicht darf. Ein `t/abmelden/` neben `t/[code]/`
  gewänne zwar die Auflösung, legte aber eine Falle in den einen Pfad, der auf laminierten
  Kärtchen steht; `/abmelden` steht auf keinem Gegenstand und ist frei wählbar.
- **Alle Modul-Routen liegen unter `src/app/m/lagerbuch/…`, nie unter `src/app/api/…`.** Beide
  Ablageorte sind gültige Next-Routen und bauen fehlerfrei; am falschen Ort zielt der Host-Rewrite
  auf einen Pfad, an dem nichts liegt — 404 auf jedem gescannten Kärtchen.

**Nicht betroffen und damit 1:1 portierbar:** `/`, `/t/<code>`, `/g/<code>`, `/a/<artikelId>`,
`/helfer/*`, `/verwaltung/*`. Die öffentliche Pfadform ändert sich an keiner Stelle
(Entscheidung 18 a).

**`public/` ist der falsche Ort und bleibt leer.** `proxy.ts:103` schließt vom Matcher nur
`_next/static|_next/image|favicon.ico` aus; `/icon-192.png` würde auf dem Lagerbuch-Host nach
`/m/lagerbuch/icon-192.png` umgeschrieben und liefe ins 404 — während dieselbe Datei auf **jedem
anderen** Host an der Wurzel ausgeliefert würde. Der Spike sagt es wörtlich: „`public/` wäre der
falsche Ort: statische Dateien werden auf allen Hosts ausgeliefert."
(`docs/spikes/2026-07-19-qr-offline-pwa.md:20-24`). Icons und Manifest laufen deshalb über Route
Handler unter dem Modul — `qr` hat Nexts Dateikonvention aus demselben Grund **umgangen**
(`m/qr/pwa-icon.svg/route.ts`). §7.10.2 führt die fünf Handler aus und beantwortet damit die offene
Frage aus Falle 56, indem es sie nicht stellt.

### 2.8 `middleware.ts` fällt weg — wohin die beiden Cordons gehen

**Die Suite hat genau eine Middleware, und sie heißt `src/proxy.ts`.** In Next 16 ist das die
Umbenennung von `middleware.ts` (`CLAUDE.md:82-89`); ihr Matcher (`proxy.ts:103`,
`/((?!_next/static|_next/image|favicon.ico).*)`) umfasst praktisch jede Anfrage. **Module bringen
keine eigene mit**, und modulspezifische Zweige in `proxy.ts` verstießen gegen die core-Regel „nur
was ein zweites, heute belegbares Modul braucht" (`docs/design/README.md:23-33`).
`src/middleware.ts` wird also **gelöscht, nicht portiert**. Beide Cordons werden aufrufbare
Funktionen in `_lib/`:

| heute | danach | Ort |
|---|---|---|
| `verwaltungCordonDecision` (`src/lib/auth/cordon.ts:14-20`) | `requireLagerbuchAdmin()` | `_lib/zugang.ts` (§2.5, §3.6) |
| `helferGateDecision` + `verifyHelferSession` in der Edge (`src/middleware.ts:24-31`) | `requireHelferSitzung(db)` / `requireHelferSchreibend(db)` | `_lib/helferZugang.ts` (§3.4.4) |

Fünf Folgen, die alle in dieses Kapitel gehören, weil sie den Baum bestimmen:

1. **Der Riegel läuft danach im Node-Kontext und nach dem Routen-Matching, nicht davor in der
   Edge.** Das ist ein Gewinn, nicht nur eine Verschiebung: die Helfer-Prüfung war bewusst DB-frei,
   weil sie in der Edge lief (`middleware.ts:24-25`). Im Node-Kontext ist der DB-Recheck von
   `tokens.aktiv` ohne Zusatzaufwand möglich — **der Port macht Entscheidung 13 (b) billiger als
   heute**, und §3.4.4 wählt sie.
2. **Die aufrufende Stelle ist nie ein einzelnes gemeinsames Layout** (§2.1 d) — und sie trägt
   **je nach Ort eine andere Form**: Riegel in Layouts und Actions, Prädikat in Weichen (§3.2.1).
   Verbindliche Aufrufliste:
   - `requireLagerbuchAdmin()` in `verwaltung/(arbeit)/layout.tsx`, in
     `verwaltung/(druck)/layout.tsx` — **und in jeder Verwaltungs-Action**, die sie voraussetzt.
   - `requireHelferSitzung(db)` in **`helfer/layout.tsx`, sonst nirgends**;
     `requireHelferSchreibend(db)` in jeder schreibenden Helfer-Action.
   - In den beiden Rollen-Weichen `g/[code]/page.tsx` und `a/[artikelId]/page.tsx` steht **kein**
     `require*` außer dem Host-Riegel: sie lesen `helferZugangOderNull(getDb())` und
     `istLagerbuchAdmin(await viewerOderNull())` und entscheiden selbst (§7.4.3). Beide haben einen
     dritten gültigen Fall — „keine Sitzung → Gate mit `returnTo`" —, den ein werfender Riegel nach
     `/login` umleitete. ⚠️ `/g` hat überdies **gar keinen** Zweig, der eine Helfer-Sitzung
     *verlangt*: der Bestand liest sie dort nur als Prädikat, um Helfer nach `/helfer` zu schicken
     (`g/[code]/page.tsx:23-24`).
   - Dieselbe Form auf dem Gate `page.tsx`: `istLagerbuchAdmin(await viewerOderNull())` →
     `redirect(adminLandingPfad(returnTo))` (§7.2.4). Auf dieser Seite ist „keine Sitzung" der
     Regelfall, nicht die Ausnahme.
3. **Der Action-POST-Vorriegel fällt weg — aber er war nie der Riegel.** Der Matcher deckte
   `/verwaltung/:path*` (`middleware.ts:35`) und lief damit auch für die POSTs, mit denen Next
   Server Actions ausliefert. Die Präzision ist hier wichtig, damit beim Port nicht das Falsche
   geschützt wird: **Action-IDs sind global**, ein Angreifer kann die ID einer Verwaltungs-Action
   jederzeit gegen `/` posten, wo der Matcher nie griff. Die eigentliche Zusage ist die
   Vollständigkeit der Guard-Liste — 44 von 44 Actions unter `src/actions/`, plus die drei bewusst
   ungeschützten (§3.8.2). *Kein Gate:* eine fehlende Guard-Zeile ist typkorrekt, lint-sauber und
   sieht wie ein Erfolg aus; es gibt keinen Test, der eine Action ohne Sitzung aufruft. **Deshalb
   liegen alle Actions in `_actions/`** (§2.1) und deshalb schuldet §3.8 den Datei-für-Datei-Nachweis
   samt `_actions/guards.test.ts`.
4. **`jose` bleibt nötig und wird Suite-Abhängigkeit** (Falle 58). Der Wegfall der Edge-Laufzeit
   nimmt den Grund für `jose` nicht weg — die Helfer-Sitzung ist weiterhin ein signiertes JWT.
5. **Die Sorge um `/t` ist gegenstandslos, die um `/g` nicht.** Ein Layout-Guard unter
   `src/app/m/lagerbuch/layout.tsx` könnte `/t/<code>` nicht mitgaten, weil Route Handler von keinem
   `layout.tsx` umschlossen werden (Falle 55). `/g/[code]` ist dagegen eine **Page** — und genau
   deshalb steht sie in §2.1 außerhalb jeder Group und trägt ihre Weiche selbst.

**Das Modul-Layout ist deshalb riegelfrei** (§2.1 f): es wäre die vierte Stelle, an der ein Riegel
„fast" sitzt — es umschließt weder `/t` (Route Handler) noch könnte es zwischen Helfer- und
Verwaltungsklasse unterscheiden. Es trägt ausschließlich `metadata.manifest`. Die Rahmen liegen in
`_ui/` und werden von den vier Layouts, den zwei Weichen und den drei Helfer-Seiten importiert.

### 2.9 Shell-Varianten — verschieden je Bereich, und `full` ist nur die Vorgabe

Der Registry-Wert `shell: "full"` ist die Vorgabe; **welche Shell eine Route wirklich bekommt,
entscheidet ihr Layout.** Genau so fährt `files`: Registry `shell: "full"` (`registry.ts:87`), und
die beiden `(oeffentlich-*)`-Layouts binden gar keine `Shell` ein. Verbindlich für lagerbuch:

| Bereich | Shell | Gestaltungsklasse |
|---|---|---|
| `verwaltung/(arbeit)/*` (23 Seiten) | `Shell variant="full"` + `nav` | Admin-Ansicht: antd 6 + Suite-Theme + Suite-Chrome (`docs/design/README.md:20-21`) |
| `verwaltung/(druck)/etiketten` | **keine** | Admin-Ansicht ohne Chrome (§8.4) |
| `helfer/*`, `/` (Gate), `/a` | **keine** | **öffentliche Ansichtsklasse**: eigene CSS-Module, **kein antd** (`docs/design/README.md:17-19`, §7.1) |
| `/g/<code>` (Barcode-Deep-Link) | `Shell variant="full"` + `nav`, über `_ui/VerwaltungsRahmen.tsx` | **Admin-Ansicht**, ausdrücklich NICHT die öffentliche Klasse: der einzige **gerenderte** Ausgang der Datei ist admin-only (§2.1 c, §8.1 8-C2, §11.3). Auch die Überschrift von §7.1 führt `/g` nicht |

⚠️ **Auflage an das Verwaltungskapitel (§6.15, Auflage 1; eingelöst in §6.1.2):** **kein Layout außer**
`verwaltung/(arbeit)/layout.tsx` mountet `<Shell>`. Weder `src/app/m/lagerbuch/layout.tsx` noch ein
`verwaltung/layout.tsx` darf es tun — ein Layout ohne Gruppenklammer ist Vorfahr **aller** Kinder,
auch der Gruppe `(druck)` und (beim Modul-Layout) des gesamten Helfer-Zweigs. Der Fehler ist der
96px-Überlauf aus §7.1, und `pnpm build` findet ihn nicht. ⚠️ **Das Verbot gilt Layouts.** Die eine
**Blattseite**, die die Shell für sich allein mountet, ist `g/[code]/page.tsx` — sie hat keine
Nachfahren, und ihr einziger gerenderter Zustand ist admin-only (Tabellenzeile oben, Warnabsatz am
Ende dieses Abschnitts).

**Warum `(druck)` keine Shell bekommt.** `FullShell` ist `<Layout style={{minHeight:"100vh"}}>` +
`<SuiteHeader>` + `<Content style={{padding: SPACE.lg}}>` (`core/shell/FullShell.tsx:20-22`). Im
Druck bleibt `minHeight:100vh` im Fluss und erzeugt leere Folgeseiten hinter dem Bogen, und der
App-Switcher der Kopfzeile würde mitgedruckt. Das ist derselbe Grund, aus dem `feedback` seine
Aushang-Druckansicht in eine eigene Group mit eigenem Layout gelegt hat
(`m/feedback/(print)/layout.tsx`). **Was in keiner Variante bleiben darf:** der heutige
`body * { visibility: hidden }`-Block (`globals.css:277`) — er ist per CSS-Modul nicht kapselbar
(CSS Modules schreiben ausschließlich **Klassen**selektoren um) und würde **jede** Druckseite der
Suite leeren, auch die von `feedback` und `files` (Falle 43). Die konkrete Druckgeometrie steht in
§8.4; §2 legt nur Group und Layout fest.

**Warum der Helfer-Zweig die öffentliche Ansichtsklasse bekommt — Entscheidung 28, Option (d).**
Die vollständige Begründung samt der gemessenen 96px steht in §7.1. Für den Baum genügen zwei
Folgen:

- Das Modul deklariert **keinen** `SuiteNavItem` für `/helfer/*`. Der `nav`-Slot bedient
  ausschließlich `/verwaltung/*` (§2.10).
- **Zwei Fallen fallen strukturell weg.** Ohne antd im gesamten Helfer-Zweig sind Falle 1
  (Compound-Zugriff in einer Server Component → HTTP 500) und Falle 7 (`@ant-design/icons` in RSC →
  `TypeError: (0, _react.createContext) is not a function`, **schon beim Import**, und weder von
  `build` noch von Vitest zu sehen) für 630 Zeilen Helfer-Code ausgeschlossen statt bewacht.

**Die Kopplung, die daraus folgt, wird hier mitentschieden.** Entscheidung 36 (Modul-Grenzen) hängt
an 28: **für den Helfer- und den anonymen Zweig gilt Option (a) — keine Modul-Grenzdatei, sondern
gestaltete Zustände in der Seite selbst.** Eine Suite-404 (`src/app/not-found.tsx`) mit einem
antd-`Button` (`:57`) und Geist-Schrift unter einem bewusst antd-freien Ablauf wäre ein Bruch mitten
im Weg der Helferin. Konkret: `/a/<artikelId>` mit unbekannter Kennung zeigt eine gestaltete Meldung
statt des heutigen wortlosen `redirect("/helfer")` (Falle 27).

⚠️ **`/g/<code>` ist die benannte Ausnahme im Verwaltungszweig.** Für die Verwaltung bleibt die
Suite-404 sonst die richtige Grundform (dort trägt die Ansicht ohnehin antd und Geist) — aber
`/g/<code>` ist der einzige Verwaltungspfad, den jemand mit einem **gescannten Gegenstand in der
Hand** betritt, und die Suite-404 nennt weder den gescannten Code noch führt sie zurück zum Scanner.
Deshalb bekommt auch `/g/<code>` einen gestalteten 200er-Zustand (§8.1, 8-C2; §11.3). Alle übrigen
Verwaltungs-Detailseiten mit unbekannter ID behalten die Suite-404 (§11.5, Zustand 16). Dass dazu
eine `error.tsx` kommt, entscheidet §11.2.

**Welchen Rahmen dieser Zustand trägt, wird hier entschieden und nicht später geraten: den
Verwaltungsrahmen — `_ui/VerwaltungsRahmen.tsx`, also `Shell variant="full"` samt `nav`.**
`g/[code]/page.tsx` hat nach 8-C2 nur **einen** gerenderten Ausgang: die Trefferfälle leiten weiter
(`:30`, `:32`), die Rollen-Weiche davor schickt jede Nicht-Admin-Anfrage weg (`:21-26`), und `:33`
ist heute `notFound()`. Was übrig bleibt, sieht ausschließlich eine angemeldete verwaltende Person.
Damit gehört die Datei in die Admin-Gestaltungsklasse (`docs/design/README.md:20-21`), nicht in die
öffentliche — die Tabellenzeile darüber führt sie deshalb eigenständig.

**Ein dritter, schlanker Rahmen OHNE Shell wäre die falsche Ersparnis.** §11.3 nennt „die Suite-404
**ohne Shell und ohne Modulnavigation**" als **ersten** der drei Mängel, die 8-C2 behebt, und
`iuk-suite/src/app/not-found.tsx:9-10` sagt genau das über sich selbst („alle Modul-Layouts werden
ersetzt, die Seite erscheint ohne Shell und ohne Modulnavigation"). Ein shell-loser Rahmen baute
diesen Mangel nach. Dazu ist der in 8-C2 verlangte Weg zur Geräteliste ohne Navigation ein
Einzelknopf auf einer Insel. §2.1 c sagt dasselbe mit umgekehrtem Vorzeichen: „legte man `/g` unter
einen chrome-losen öffentlichen Rahmen, stände ein Verwaltender ohne Shell und ohne Rückweg da."

**Das ist Hausform, keine Ausnahme — und es kostet Auflage 1 nichts.** `files` mountet seinen
`_ui/VerwaltungsRahmen.tsx` aus **zwei** Stellen: dem Group-Layout
(`m/files/(verwaltung)/layout.tsx:48`) und dem Rollen-Verteiler `m/files/page.tsx:80`, einer Seite
außerhalb aller Route-Groups, die das Group-Layout deshalb nicht erreicht — Next stapelt Layouts je
Pfadsegment. Der Kopfkommentar der Komponente heißt wörtlich „EINE STELLE, ZWEI IMPORTEURE"
(`m/files/_ui/VerwaltungsRahmen.tsx:12`). `/g/<code>` ist derselbe Fall. **Auflage 1 an §6 (§6.15)
wird entsprechend gefasst:** das Verbot gilt **Layouts**. Der Fehler aus §7.1.1 ist, dass ein Layout
Vorfahr des gesamten Helfer-Zweigs und der Gruppe `(druck)` wäre (96px-Überlauf, Falle 41);
`g/[code]/page.tsx` ist ein **Blatt** ohne Nachfahren und mountet die Shell für sich allein.

### 2.10 `nav`-Slot

Die Navigationsliste liegt in `_lib/nav.ts` — **ohne `"use client"`**, und der Ablageort ist keine
Geschmacksfrage: läge das Array neben einer Client-Komponente in `_ui/`, bekäme die Server
Component eine **Client-Referenz statt des Wertes**, HTTP 500 für die ganze Seite, und **weder
`pnpm build` noch Vitest finden das** (`CLAUDE.md:24-27`, `docs/design/README.md:87-103`; unter
Vitest ist `"use client"` ein wirkungsloser String). Gelesen wird `LAGERBUCH_NAV` von den **Server
Components, die den Rahmen aufrufen** — `verwaltung/(arbeit)/layout.tsx` und `g/[code]/page.tsx`
(§2.9) —, nicht von `_ui/VerwaltungsRahmen.tsx` selbst: `nav` ist dort ein **Pflicht-Prop ohne
Vorgabewert**, wie bei `files` (`m/files/_ui/VerwaltungsRahmen.tsx:21-25` schreibt den Grund aus —
ein optionaler Vorgabewert wäre die einzige Bauform, deren Fehlerfall niemand sieht: eine Seite
ohne Navigation statt eines Typfehlers).

```ts
// _lib/nav.ts — KEIN "use client".
export const LAGERBUCH_NAV: SuiteNavItem[] = [ /* Inhalt: Entscheidung 31, §6.3.1 */ ];
```

Drei Festlegungen zum **Mechanismus** — der **Inhalt** (welche der heute 15 Ziele aus
`SideNav.tsx:8-24` in die Leiste kommen, Entscheidung 31) gehört §6.3.1:

1. **`href` trägt die äußere Pfadform** (`/verwaltung/artikel`, nicht `/m/lagerbuch/...`) — §2.1 g.
2. **`SuiteNavItem` hat bewusst kein `icon`-Feld** (`core/shell/types.ts:19-26`): „die
   Modulnavigation steht in einer Zeile bzw. Liste mit Text, und ein Icon je Unterseite wäre
   Zierrat, den niemand pflegt". „Nur Icons ab einer bestimmten Breite" ist damit eine
   `core`-Änderung, keine Modulentscheidung — und als Ausweg für Entscheidung 31 verbaut.
3. **Die Leiste läuft bei 15 Einträgen über, und das ist ein `core`-Befund.** `.modulnav`
   (`core/shell/shell.module.css:122-129`, waagerechte Fassung erst in der `min-width: 768px`-Abfrage,
   `:194-196`) ist ein Flex-Container in Vorgabestellung `nowrap` **ohne** `overflow-x`; fünfzehn
   Links mit den lagerbuch-Beschriftungen liegen überschlägig bei 1.300–1.400px, bei 1280px kann kein
   Link unter seine `min-content`-Breite schrumpfen, also scrollt `documentElement` waagerecht. Unter
   768px steht die Leiste auf `display:none` und die Ziele wandern in einen Drawer — dort ist das
   Problem also nicht. **Entscheidung 31 ist in §6.3.1/§6.3.2 gefallen:** alle 15 Einträge bleiben,
   `.modulnav` bekommt `overflow-x: auto`. ⚠️ Die Begründung dafür ist **nicht** „lagerbuch ist der
   zweite Nutznießer" — dieser Maßstab gilt für Hebungen; hier wird ein vorhandener `core`-Baustein
   repariert (§6.3.2). **Die Prüffrage aus `docs/design/README.md:236-242` gilt unabhängig davon**:
   hat jede Action einen Weg in der Oberfläche, und führt kein Weg dorthin, wo die aufrufende Person
   nicht hindarf.

Die öffentlichen Ansichten (`/`, `/a`, `/helfer/*`) bekommen **keine** Shell, **kein** `nav`
und **keinen** App-Switcher. ⚠️ **`/g` gehört ausdrücklich nicht dazu** — sein einziger gerenderter
Zustand ist admin-only und trägt Shell und `nav` über `_ui/VerwaltungsRahmen.tsx` (§2.9, §8.1 8-C2).

### 2.11 Was §2 ausdrücklich nicht entscheidet

Damit kein späteres Kapitel eine dieser Fragen für schon beantwortet hält:

| Frage | Kapitel |
|---|---|
| Ob die sieben `.sql` wörtlich wandern oder das Verzeichnis neu generiert wird (E4) | §4.3 |
| Wo `ensureHandlager` genau landet (E25) — §2.2 legt nur fest: **nicht** `seedAllModules()` | §4.3 |
| Die Form der Absenderadresse und der Zähler (E12) — §1.2 legt nur fest: sie fällt in Spec 1 | §3.5 |
| `callbackUrl`, `kein-zugriff`, der verlorene `console.warn` (E10a, E15) | §3.3, §3.6.6, §11.4 |
| Ob `requireHelferSitzung` den `tokens.aktiv`-Recheck bekommt (E13) — §2.8 legt nur fest, dass der Port ihn billig macht | §3.4.4 |
| Der Inhalt von `LAGERBUCH_NAV` und der `.modulnav`-Überlauf (E31) | §6.3.1, §6.3.2 |
| Die Druckgeometrie des Etikettenbogens (E20) — §2.9 legt nur Group und Layout fest | §8.4 |
| PWA-Manifest und Icons (E24) — §2.7 legt nur die Ablageregel fest | §7.10 |
| Backup-Job und `startBackgroundWork()` (E22) | §10.7 — dort steht der Rückfall A31; entschieden wird sie vom **Betreiber** (§15.1 Nr. 4), nicht von einem Kapitel dieser Spec |
| `deploymentId` und Release-Kanal (E23) | **kein Kapitel dieser Spec** — suiteweites Vorhaben, §15.3 Nr. 24 (§1.5, Punkt 4) |
| **Wer den Mount von `<Shell variant="full">` schreibt: das Group-Layout oder `_ui/VerwaltungsRahmen.tsx`.** §2.1 und §2.9 beschreiben ihn als „`(arbeit)/layout.tsx` rendert `VerwaltungsRahmen`, und der mountet die Shell", §6.1.2 einmal auch als „`(arbeit)/layout.tsx` rendert `<Shell variant="full" nav={LAGERBUCH_NAV}>`". Das ist **dieselbe** Bauform in zwei Formulierungen; **welche Zeile in welcher Datei steht, ist hier bewusst nicht entschieden**. Beide Formen halten Auflage 1 (§6.15) und beide vertragen den zweiten Importeur `g/[code]/page.tsx` | §6.1.2 |
---

## 3. Die zwei Zugänge: Suite-SSO und Helfer-Sitzung

`lagerbuch` bringt etwas mit, das kein Bestandsmodul der Suite hat: **zwei Sitzungsarten
nebeneinander**, mit gegenläufiger Reichweite. Die Suite-Sitzung folgt der Elterndomain
(`AUTH_COOKIE_DOMAIN`, `core/auth/cookies.ts:47`; `iuk-suite/compose.yaml:25` setzt sie auf
`.iuk-ue.de`) — ein angemeldeter Mensch ist auf jedem Modul-Host derselbe. Die Helfer-Sitzung ist
host-only (`src/lib/auth/helferSession.ts:31-33`, kein `domain`) und soll es bleiben. `feedback` hat
anonymen Zugang, aber keine zweite Sitzung; `files` hat zwei Host-Rollen, aber nur eine Sitzung.
lagerbuch ist der erste Fall, in dem beides zusammenkommt.

Dieses Kapitel entscheidet fünf Dinge: **wo die beiden Cordons laufen**, **wie die Helfer-Sitzung
gebaut ist**, **welche Absenderadresse das Gate-Rate-Limit benutzt**, **wie die Admin-Rolle
aufgelöst wird** und **wie die Nutzerkennung ans Journal kommt**.

### 3.1 Der Bestand in einem Bild — und was davon nicht mitkommt

| Heute in lagerbuch | Beleg | In der Suite |
|---|---|---|
| Edge-Middleware, zwei Cordons, Matcher `/verwaltung/:path*`, `/helfer/:path*`, `/a/:path*` | `src/middleware.ts:10-32`, `:35` | **entfällt** — es gibt genau eine `src/proxy.ts`, und modulspezifische Zweige dort verstoßen gegen die `core`-Regel (§2.8) |
| `verwaltungCordonDecision` liest `session.user.isAdmin` | `src/lib/auth/cordon.ts:14-20` | **entfällt** — `isAdmin` heißt in der Suite „ist Betreiber" (`core/auth/config.ts:170`), nicht „darf lagerbuch verwalten" |
| `signIn`-Callback weist jeden Login ohne `OIDC_ADMIN_GROUP` ab | `src/auth.config.ts:86-103` | **entfällt** — die Suite hat keinen `signIn`-Callback; jede Person mit Pocket-ID-Konto bekommt eine Sitzung |
| `pages: { signIn: "/", error: "/verwaltung/kein-zugriff" }` | `src/auth.config.ts:72` | **entfällt** — `core/auth/config.ts:93-95` setzt nur `signIn: "/login"`, es gibt suiteweit keinen `error`-Schlüssel. **Das Gate selbst bleibt** und ist weiterhin die Modulwurzel `/`; es ist nur nicht mehr Auth.js' `signIn`-Seite (§3.6.6) |
| `events.signIn` schreibt den `users`-Satz | `src/auth.ts:9-35` | **entfällt** — kein `events`-Block in `core/auth/config.ts`. Ersatz: §3.7.2 |
| `consumeRate` / `clientIp` (rechtester XFF-Eintrag) | `src/lib/auth/rateLimit.ts:11-36` | **entfällt** — ersetzt, siehe §3.5 |
| jose-Cookie `helfer_session`, HS256, 12 h | `src/lib/auth/helferSession.ts:4-33` | **bleibt**, Name und Geheimniswert unverändert, Nutzlast gekürzt (§3.4) |
| `requireHelfer` mit DB-Recheck bei schreibenden Aktionen | `src/actions/session.ts:22-28` | **bleibt und wird ausgeweitet** (§3.4.4) |
| `sanitizeReturnTo`, `tokenZielPfad`, `adminLandingPfad` | `src/lib/auth/returnTo.ts`, `tokenZiel.ts`, `cordon.ts:38-48` | **1:1**, nur der Ablageort wechselt (`_lib/returnTo.ts`, `_lib/tokenZiel.ts`, `_lib/zugang.ts`). `adminLandingPfad` verliert dabei genau einen Zweig — `ziel.startsWith("/verwaltung/kein-zugriff")` (`cordon.ts:41`) fällt mit der Seite weg (§3.3, §11.4) — und bekommt seinen Aufrufer ausgeschrieben in §7.2.4. Ohne diese Aufrufstelle wäre die Funktion toter Code: im Bestand ruft sie **genau eine** Datei, `src/app/(gate)/page.tsx:16-17` |
| `helferGateDecision` | `src/lib/auth/cordon.ts:50-66` | **entfällt als Funktion** — sie ist eine reine Pfad-/Rollenweiche ohne DB und hat im Riegelmodell aus §3.4.4 keinen Platz. Ihre drei Aussagen verteilen sich, und jede bekommt hier einen Ort: die **Pfadprüfung** (`isA`/`isHelfer`, `:57-58`) wird zur Dateiablage — `helfer/layout.tsx` deckt `/helfer/*`, die Rollen-Weiche deckt `/a/*` (§2.1 c); die **Rollenprüfung** (`allowed = isA ? hasHelfer \|\| isAdmin : hasHelfer`, `:61`) wird zur Weiche in `a/[artikelId]/page.tsx` (§7.4.3, §3.2.1); die **Umleitung aufs Gate** (`:64-65`) wird zu `requireHelferSitzung`, das ab jetzt zusätzlich `tokens.aktiv` liest und einen benannten `grund` mitgibt (§3.4.4, §3.9). ⚠️ **Es gibt danach keine 1:1-Entsprechung mehr** — wer eine sucht, baut den Edge-Cordon nach. Der Verweis „siehe `helferGateDecision`" im Allowlist-Kommentar von `adminLandingPfad` (`cordon.ts:33-35`) wird beim Port auf `requireHelferSitzung` umgehängt (§3.6.6) |

**Drei** Bausteine ziehen also unverändert um (`sanitizeReturnTo`, `tokenZielPfad`,
`adminLandingPfad`), zwei bleiben und werden ausgeweitet (das jose-Cookie, `requireHelfer`), und
**sechs** verschwinden — `helferGateDecision` ist der sechste, und er ist der einzige, den die
frühere Fassung dieses Kapitels irrtümlich als 1:1-Umzug führte. Für jeden der sechs schreibt
dieses Kapitel den Ersatz vor.

### 3.2 Wo die beiden Cordons laufen

**Entschieden: Option (a) + (d) aus Entscheidung 10 der Analyse** — modulinterne, aufrufbare
Riegel in `_lib/`, **plus** eine modul-eigene Host→Rolle-Auflösung. Das folgt der Empfehlung der
Analyse; (b) fällt, weil ein Pfadpräfix je Modul in `core/routing.ts` gegen die `core`-Regel
verstieße, und (c) fällt, weil eine zweite Domain jedes gedruckte Etikett host-abhängig machte,
ohne dass lagerbuch — anders als `files` — zwei disjunkte Pfadräume hätte (§3.10).

`lagerbuch` bekommt `requiresAuth: false` in `core/registry.ts` (zwingend, §2.3). Damit
steigt `canAccess` für dieses Modul immer früh mit `true` aus (`core/registry.ts:155`) und liest
`requiredGroups` **nie**. Der gesamte Zugriffsschutz liegt modulintern.

#### 3.2.1 Die Riegel, die Prädikate und ihre Verankerung

| Riegel | Datei | Wirft? | Verankert an |
|---|---|---|---|
| `requireLagerbuchHost(headers)` | `_lib/host.ts` | `notFound()` | `verwaltung/(arbeit)/layout.tsx`, `verwaltung/(druck)/layout.tsx`, `helfer/layout.tsx`, `a/[artikelId]/page.tsx`, `g/[code]/page.tsx`, `page.tsx` (Gate) |
| `lagerbuchHostOderNull(headers)` | `_lib/host.ts` | nein | **jeder Route Handler, alle sieben** — `t/[code]/route.ts`, `abmelden/route.ts`, `manifest.webmanifest/route.ts` und die vier Icon-Handler |
| `requireLagerbuchAdmin()` | `_lib/zugang.ts` | `redirect("/login…")` oder `notFound()` | `verwaltung/(arbeit)/layout.tsx`, `verwaltung/(druck)/layout.tsx` **und jede Verwaltungs-Action** in `_actions/` — **ausdrücklich NICHT in den Rollen-Weichen und nicht auf dem Gate** |
| `istLagerbuchAdmin(await viewerOderNull())` | `_lib/zugang.ts` | **nein — Prädikat** | `a/[artikelId]/page.tsx`, `g/[code]/page.tsx`, `page.tsx` (Gate, für `adminLandingPfad`, §7.2.4) |
| `requireHelferSitzung(db)` | `_lib/helferZugang.ts` | `redirect("/?grund=…")` | **nur `helfer/layout.tsx`** |
| `helferZugangOderNull(db)` | `_lib/helferZugang.ts` | **nein — Prädikat** | `a/[artikelId]/page.tsx`, `g/[code]/page.tsx` (§7.4.3) |
| `requireHelferSchreibend(db)` | `_lib/helferZugang.ts` | nein — liefert `{ok:false, grund}` | jede schreibende Helfer-Action (`_actions/buchung.ts`, `_actions/check.ts`) |

Die vollständige Host-Verankerungstabelle steht in §2.6; sie wird hier nicht wiederholt.

**Die Regel hinter der Tabelle, und sie gilt für jeden künftigen Zugriffspfad dieses Moduls:
Riegel in Layouts und Actions, Prädikat in Weichen.** Sie ist keine Einzelkorrektur, sondern der
Schnitt, an dem sich in diesem Modul die Form der Prüfung entscheidet:

- **Riegel** (`require*`) stehen dort, wo es **einen** zulässigen Ausgang gibt und jeder andere Fall
  ein Fehl- oder Manipulationsfall ist: in den vier Layouts und in jeder Server Action. Dort ist der
  Wurf die richtige Form. §7.3 nimmt den Riegelfall ausdrücklich vom Rückgabewert-Gebot aus („nicht
  ‚erwartbar', sondern ‚manipuliert'"), §11.5 Zustand 22 hält ihn als Zustand fest, und die Suite
  sagt denselben Satz: `m/files/(verwaltung)/actions.ts:26-28` — „Feldfehler werden ZURUECKGEGEBEN,
  nicht geworfen … Zugriffsverletzungen gehoeren NICHT dazu: `requireFilesAccess` wirft weiter".
- **Prädikate** (`istLagerbuchAdmin`, `helferZugangOderNull`, `viewerOderNull`) stehen dort, wo
  **mehrere** Ausgänge zulässig sind: in den beiden Rollen-Weichen `/a/[artikelId]` und `/g/[code]`
  und auf dem Gate. Diese drei Dateien haben je **drei** gültige Fälle, und der dritte ist immer
  „keine Sitzung" — bei `/a` und `/g` das Gate mit `returnTo` (`a/[artikelId]/page.tsx:19`,
  `g/[code]/page.tsx:25`), auf dem Gate die Anzeige des Gates selbst. **Ein Riegel an dieser Weiche
  schickte jeden anonymen Scan eines Regaletiketts nach `/login`** — genau der Ausfall, den
  `requiresAuth: false` (§2.3) verhindern soll (§11.5, Zustand 18). *Kein Gate:* der Fehler ist
  typkorrekt, lint-sauber und für `pnpm build` unsichtbar; ein E2E fände ihn nur mit einem Abruf
  **ohne** Cookie.
- ⚠️ **Die Grenze gehört zur Regel und darf beim Zitieren nicht wegfallen.** „Prädikat in Weichen"
  gilt **nicht** für `_actions/`: die Quelltext-Zusicherung aus §3.8.2 („jede exportierte Funktion
  in `_actions/*.ts` ruft `requireLagerbuchAdmin` oder `requireHelferSchreibend`") und §6.15,
  Auflage 3 wären sonst rot. Eine Action hat keine Weiche — sie hat einen Aufrufer, der schon
  entschieden hat.

**Die Server Actions liegen unter `src/app/m/lagerbuch/_actions/`** — ein vierter Private Folder
neben `_db/`, `_lib/`, `_ui/`. Begründung: der Bestand hat **16 Module** mit `"use server"` unter
`src/actions/`, `feedback` legt seine Actions dagegen in eine einzelne `m/feedback/actions.ts`. Bei
sechzehn Dateien ist die eine Datei kein Angebot, und ein Ordner ohne `_` wäre ein Routensegment.
Die Festlegung steht in §2.1 (a); §3.8.2 stützt sich darauf.

**Der Preis, ausgeschrieben.** Ein Riegel im Layout greift später als einer vor dem Rendern, und
zwar in drei getrennten Hinsichten:

1. **Layout und Seite werden nicht garantiert nacheinander ausgewertet.** Der Layout-Riegel
   verhindert zuverlässig die *Antwort*, aber nicht, dass die Datenzugriffe der Seite darunter
   bereits begonnen haben. Deshalb gilt für dieses Modul dieselbe Zwei-Linien-Regel wie in
   `feedback`: der Layout-Riegel ist die erste Linie, und **jede Seite, die eine Kennung aus der URL
   auflöst, prüft die Zugehörigkeit selbst gegen die Datenbank** (`requireFeedbackAccess.ts:20-23`
   nennt die Aufteilung, `m/feedback/(admin)/layout.tsx:25-26` bestätigt sie). Keine Seite unter
   `/verwaltung` darf eine Nebenwirkung im Rendern haben.
2. **Route Handler haben kein Layout.** Das ist die Verankerung, die man vergisst
   (`m/files/_lib/hostRolle.ts:19-25` schreibt es aus). Bei lagerbuch trifft es `/t/<code>` — den
   einzigen Weg in die Helfer-Sitzung und die einzige Tür mit bleibender Datenwirkung.
3. **Der Cordon fing bisher auch die Server-Action-POSTs unter `/verwaltung` ab** (Matcher
   `src/middleware.ts:35`). Das fällt ersatzlos weg. **Es war aber nie der eigentliche Riegel:**
   Action-IDs sind global, eine Verwaltungs-Action lässt sich jederzeit gegen `/` posten, wo der
   Matcher nie griff. Die tragende Zusage war und ist die **Vollständigkeit der Guard-Liste** —
   heute 44 von 44 Actions unter `src/actions/`, plus drei bewusst ungeschützte (§3.8.2). §3.8 macht
   daraus eine geprüfte Zusage statt einer Absichtserklärung.

#### 3.2.2 `_lib/host.ts` — der Host-Riegel

**Der vollständige Quelltext samt Begründung steht in §2.6** und wird hier nicht doppelt geführt.
Für dieses Kapitel zählen drei Eigenschaften:

- Das Prädikat lautet `moduleForHost(resolveHost(headers))?.key === "lagerbuch"`. **Es gibt keinen
  „kein Prod-Host konfiguriert → durchlassen"-Zweig** — er wäre die Sperre, die sich selbst
  abschaltet. Am Arbeitsbaum nachgeprüft: `core/registry.ts:141-148` trifft `<key>.localtest.me`
  **vor und unabhängig von** `prodHostsFor`, das Prädikat deckt Dev und E2E also ohne jede
  Env-Variable ab.
- `requireLagerbuchHost` wirft `notFound()`, `lagerbuchHostOderNull` wirft nie und liefert
  `"lagerbuch" | null` — ein `notFound()` ist im Antwortweg eines Route Handlers keine brauchbare
  Antwort auf einen gescannten QR-Code (`m/files/_lib/hostRolle.ts:30-32`).
- Ohne diesen Riegel löste ein Aufruf auf `files.iuk-ue.de/m/lagerbuch/t/123-456` einen echten Code
  ein, setzte `last_used_at` und legte auf **diesem** Host ein gültiges Helfer-Cookie ab
  (`src/lib/auth/helferSession.ts:31-34` führt kein `domain`, ist also host-only) — eine zweite
  funktionierende Herkunft des Moduls, aus der echte Buchungen in das append-only Journal liefen;
  und in der Token-Tabelle stände „zuletzt <Zeitstempel>" für ein nie ausgegebenes Kärtchen
  (`TokenTable.tsx:67`). ⚠️ **Nicht mehr Teil des Arguments: „dauerhaft unlöschbar".** Das galt,
  solange `pruefeToken` (`src/actions/loeschen.ts:89-99`) den Hard-Delete an `last_used_at IS NULL`
  hängte; Entscheidung 8-F (§8.3) streicht den Hard-Delete für Tokens ganz. Der Riegel bleibt — er
  wird ab jetzt mit den zwei verbleibenden Folgen bezahlt (§2.6).

#### 3.2.3 Eine Auflage und ein Rollback-Satz

1. **`SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me` gehört in `webServer.env` der
   `iuk-suite/playwright.config.ts`** — nicht, weil die Sperre es bräuchte (sie greift ohne die
   Variable), sondern weil die Zahlen-Boot-Prüfungen aus §10.5 an `prodHostsFor(...).length > 0`
   hängen und der Zwei-Host-E2E aus §12.2 sonst nicht darstellbar ist (§2.6).
2. **`SUITE_HOST_LAGERBUCH` leeren ist der Rollback** — und er nimmt den Host vollständig vom Netz,
   er liefert keine ältere Version aus. Das gehört ins Runbook, nicht in diese Datei.

#### 3.2.4 Was ausdrücklich NICHT gebaut wird

- **Keine Änderung an `core/routing.ts`**, kein Pfadpräfix je Modul. Ob `/m/*` suiteweit gegatet
  wird, ist eine eigene Suite-Spec (der Symptomfund `iuk-ue.de/m/beta` steht schon in
  `KONSOLIDIERUNG-PROGRESS.md`) — nicht Teil dieser Spec (§1.5). Für lagerbuch genügt der
  modulinterne Riegel.
- **Kein zweiter Host.** lagerbuch bleibt ein Host, eine Rolle. Dass `SUITE_HOST_LAGERBUCH`
  mehrere Werte tragen *darf* (§2.6), ist eine Betriebsoption für gedruckte Etiketten, keine
  zweite Rolle.

### 3.3 Was eine angemeldete Person ohne Lagerbuch-Gruppe sieht

**Entschieden: Suite-Standard (Entscheidung 10a, Option (a)).** `notFound()` — das rendert
`src/app/not-found.tsx`, dessen zweiter Absatz genau für diesen Fall geschrieben wurde („Was nicht
freigegeben ist, sieht in dieser Suite genauso aus wie etwas, das es nicht gibt.",
`not-found.tsx:41-46`; der Kopfkommentar `:16-22` schreibt aus, warum dieser Absatz dort steht).
`/verwaltung/kein-zugriff` wird **ersatzlos gestrichen**; die Seite lebt von
`.gate`/`.gatebrand`/`.gatesub` aus `src/app/globals.css`, die beim antd-Neubau ohnehin fallen, und
ihr einziger realer Zugangsweg — `pages.error` (`src/auth.config.ts:72`) — existiert in der Suite
nicht. Die ausführliche Abwägung steht in §11.4.

Der bewusst hingenommene Verlust ist die **Benennbarkeit**: der Suite-404 nennt weder den
Gruppennamen noch die Leitung. Der Gegenwert ist die Zusage aus `core/auth/guards.ts:15-17`, dass die
Existenz von `/verwaltung` nicht verraten wird — bei einem Journal mit Klarnamen und einem Druckbogen
mit Token-Codes im Klartext ist das mehr wert als die genauere Auskunft.

**Für die, die es beheben können, wird der `console.warn` wiederhergestellt.** Er ersetzt
`src/auth.config.ts:94-99`, den einzigen Ort, an dem heute sichtbar wird, *welche* Gruppen im Token
standen — laut Kommentar dort die Antwort auf die häufigste Fehlkonfiguration beim Go-live. Ein
`grep` auf `console\.` über `iuk-suite/src/core/auth/` liefert null Treffer; die Suite antwortet
stumm.

```ts
// _lib/zugang.ts — Ausschnitt
/**
 * EINMAL JE PERSON JE PROZESS, nicht je Anfrage. Der Riegel liegt auf einem
 * 404-Pfad, den ein Bot beliebig oft treffen kann; unbegrenztes Loggen waere
 * ein Flutungsvektor und machte `docker logs` fuer genau den Zweck unbrauchbar,
 * fuer den die Zeile da ist. Der Satz ersetzt `src/auth.config.ts:94-99`.
 *
 * KEINE Kennung, keine E-Mail, kein Name in der Zeile — dieselbe Form wie heute
 * (auth.config.ts:95-99 protokolliert Gruppen und Claim-Schluessel, keine Person).
 */
const bereitsGemeldet = new Set<string>();

function meldeFehlendeGruppe(sub: string, gruppen: string[]): void {
  if (bereitsGemeldet.has(sub)) return;
  bereitsGemeldet.add(sub);
  console.warn(
    `[lagerbuch] Zugriff auf /verwaltung abgelehnt: keine der Gruppen ` +
      `${JSON.stringify(adminGroupsFor(getModule("lagerbuch")))} in den Token-Gruppen ` +
      `${JSON.stringify(gruppen)}. Pruefe SUITE_ADMIN_GROUP_LAGERBUCH und ob Pocket ID ` +
      `einen "groups"-Claim mit dieser Gruppe ausliefert.`,
  );
}
```

⚠️ **Annahme:** Der prozess-lokale `Set` wächst mit der Zahl abgewiesener Personen, nicht mit der
Zahl der Anfragen; bei einer Organisation dieser Größe ist das eine dreistellige Obergrenze und
braucht keine Verdrängung. Der `sub` dient hier ausschließlich als Dedup-Schlüssel im Speicher und
erscheint **nicht** in der Zeile.

### 3.4 Die Helfer-Sitzung

#### 3.4.1 Geheimnis, Startriegel und die Compose-Zeile

**Ein eigenes Geheimnis** (Entscheidung 11, Option (a)), und es wird beim Cutover **wertgleich aus
der produktiven `stack.env` übernommen** (Betreiber-Entscheidung 4) — **unter dem neuen Namen
`LAGERBUCH_HELFER_SITZUNG_SECRET`** (§10.3). Der Schlüsselname ändert sich, der Wert nicht.
Option (b) — `AUTH_SECRET` mit Domänentrenner nach dem Muster von `m/files/_lib/passwort.ts:30-36` —
wäre die hausüblichere Bauform, beendete aber schlagartig jede laufende Feld-Sitzung. Bei einem
Cutover-Abend mit laufenden Fahrzeug-Checks ist das der teurere Tausch.

⚠️ **Guardrail, die in keiner Richtung verhandelbar ist: lagerbuchs `AUTH_SECRET` wird NICHT in die
Suite übernommen.** Die Suite führt genau ein `AUTH_SECRET`
(`iuk-suite/compose.yaml:23`, `${AUTH_SECRET:?…}`); es zu ersetzen meldet portal, qr, feedback und
files auf einen Schlag ab. Und es kaufte für lagerbuch nichts: lagerbuchs Alt-JWT trägt
`token.isAdmin` (`src/auth.config.ts:104-113`), aber **kein** `token.groups`. Der Session-Callback der
Suite liest ausschließlich `token.groups` (`core/auth/config.ts:163-165`) — ein entschlüsselbares
Alt-Token ergäbe `groups: []`, und `istLagerbuchAdmin` (§3.6) antwortete damit `false`. Die
Verwaltungs-Sitzungen überleben den Cutover ohnehin, weil die **Suite-Sitzung nie ungültig wird**;
genau das ist die Absicht hinter Betreiber-Entscheidung 4, und sie ist erfüllt, indem man das
Suite-Geheimnis **nicht anfasst**. Die vollständige Rechnung steht in §10.6.

**Startriegel (Falle 23).** `assertProductionSecrets` (`src/lib/config.ts:101-113`) hängt heute an
`src/instrumentation.ts:6` — eine Datei, die es in der Suite gibt und die niemand modulweise anfasst;
`core/bootstrap.ts:40-50` prüft Hosts, Gruppen und die files-Blob-Ablage, sonst nichts. Der Riegel
wandert deshalb in `_lib/boot.ts` nach dem Muster von `m/files/_lib/boot.ts`; **die vollständige,
bedingte Prüfliste steht in §10.5.** Für dieses Kapitel zählt der eine Fall, den man am leichtesten
wegdenkt:

> **Der leere String wird eigens geprüft.** `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in
> Compose den **leeren String** — und leer greift den zod-Default **nicht**, nur `undefined` tut
> das. `jose` verweigert danach einen Nullschlüssel, und der Container bootet grün und fällt erst
> beim ersten `/t/<code>`-Scan mit 500 um. Das Scheitern wanderte damit von der Startzeit in die
> Nutzungszeit.

⚠️ **Abweichung von Falle 23s vorgeschlagener Abhilfe:** die Variable kommt über `env_file`, **nicht**
als `${VAR:?…}`-Zeile unter `environment`. Eine `:?`-Zeile in der versionierten `compose.yaml` hält
den **ganzen** Stack an, sobald das Image mit lagerbuch ankommt und die `.env`-Zeile noch fehlt —
vier unbeteiligte Module im Fenster zwischen Merge und Cutover. Der Riegel dagegen ist die bedingte
Boot-Prüfung, und sie hält das Scheitern in der Startzeit. Vollständig begründet in §10.6.

#### 3.4.2 Cookie: Name, Attribute, Reichweite

**Entschieden: der Name bleibt `helfer_session`** — unbedingt, in beiden Cutover-Zweigen.

Das weicht vom Hausstil ab, der präfigiert (`files_s_<shareId>`, `m/files/_lib/passwort.ts:24-28`;
`feedback-<surveyId>`, `m/feedback/actions.ts:610`). Die Begründung: das Cookie ist **host-only**
(kein `domain`), lagerbuch ist das einzige Modul auf `lagerbuch.iuk-ue.de`, und **kein anderes
Suite-Modul liest `helfer_session`** — eine Namenskollision ist konstruktiv unmöglich. Ein
Präfix kostete im günstigen Zweig genau das, wofür das Geheimnis übernommen wird: jede laufende
Feld-Sitzung. Ein bedingter Cookie-Name wäre eine Bauzeit-Gabelung, die niemand will. ⚠️ **Falls der
Betreiber den Namen später doch will:** ein Wechsel kostet ein 12-Stunden-Fenster und gehört an einen
ruhigen Tag, nicht in den Cutover.

```ts
// _lib/helferSitzung.ts — Ausschnitt
/**
 * KEIN `domain`. Das ist die eine Zeile, an der beim Port am meisten haengt.
 *
 * Die naheliegende Vorlage ist die falsche: `core/auth/cookies.ts:46-59` setzt
 * `domain` aus `AUTH_COOKIE_DOMAIN` — die Datei heisst `auth/cookies.ts`, der
 * Griff liegt nahe, und sie ist fuer die SUITE-Sitzung richtig. Kopiert man das
 * hierher, wird aus einer host-gebundenen Helfer-Sitzung ein Cookie, das an
 * JEDEN Modul-Host geschickt wird — an `files.`, an `feedback.`, an jeden
 * weiteren. Es entstuende keine Rechteausweitung (kein anderes Modul liest den
 * Namen), aber Exposition in jedem Header und in jedem Log, das Cookies fuehrt.
 *
 * Dass host-only-Cookies ueber Modul-Hosts hinweg produktiv zuschlagen, ist in
 * dieser Suite BELEGT, nicht vermutet: `core/auth/cookies.ts:5-31` schreibt den
 * Vorfall aus (`InvalidCheck: state value could not be parsed` nach dem ersten
 * Modul-Cutover). lagerbuch bringt die zweite Cookie-Familie in genau diese
 * Topologie — mit gegenlaeufiger Reichweite. Ein Admin ist auf jedem Suite-Host
 * derselbe, eine Helferin ist es je Host neu. Das ist Absicht.
 */
export function helferCookieOptionen(gueltigkeitSekunden: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: gueltigkeitSekunden,
  };
}
```

`secure` kommt jetzt aus `NODE_ENV`, nicht mehr aus `config.appBaseUrl.startsWith("https://")`
(`src/lib/auth/helferSession.ts:32`). Das ist in der Suite die verlässlichere Quelle:
`NODE_ENV=production` steht fest im Image (`iuk-suite/Dockerfile:25`), während `APP_BASE_URL` in
der Suite gar nicht existiert (§8.2).

⚠️ **Die Bedingung, unter der die Geheimnis-Übernahme überhaupt trägt, steht in keiner Analyse-Zeile
und gehört hierher:** weil das Cookie host-only ist, überlebt es den Cutover **nur, wenn der neue
Modul-Host zeichengleich der heutige ist.** Ist `SUITE_HOST_LAGERBUCH` ein anderer Host als die
heutige `APP_BASE_URL`, ist die Übernahme des Geheimnisses für Helfer-Sitzungen wirkungslos (für
`AUTH_SECRET` gälte das nicht in gleicher Weise — Auth.js-Cookies tragen `domain` aus
`AUTH_COOKIE_DOMAIN`). → **Runbook-Eingabe:** die heutige `APP_BASE_URL` im Wortlaut, und die
Bestätigung, dass `SUITE_HOST_LAGERBUCH` derselbe Host ist. Weicht er ab, gehört in die
Cutover-Kommunikation der Satz „alle Helfer müssen ihr Kärtchen einmal neu scannen".

#### 3.4.3 Nutzlast, Gültigkeit, Erneuerung, Widerruf

**Nutzlast: `{ tokenId }` — `code` und `label` fallen weg.**

```ts
export type HelferPayload = { tokenId: string };

/**
 * Was `verifyHelferSitzung` ZURUECKGIBT: die Nutzlast plus den Ablaufzeitpunkt.
 *
 * `exp` ist kein Feld der signierten Nutzlast, sondern der registrierte Claim,
 * den `setExpirationTime` setzt (`src/lib/auth/helferSession.ts:14` — unbedingt,
 * auch im Bestand) und den `jose` beim Verifizieren ohnehin schon prueft. Ihn
 * hier herauszureichen kostet keinen zusaetzlichen Zugriff und ist der EINZIGE
 * Datenpfad der Restzeit-Anzeige aus Punkt 1 weiter unten; ohne ihn ist die dort
 * festgeschriebene Zusage nicht baubar.
 *
 * ⚠️ Fehlt `exp`, liefert `verifyHelferSitzung` `null`. Das ist eine
 * Verschaerfung gegenueber der Feldpruefung eine Zeile hoeher und deshalb
 * ausdruecklich gegengeprueft: der Aussteller setzt den Claim seit jeher
 * unbedingt (`helferSession.ts:14`), ein Alt-Cookie traegt ihn also. Der
 * Testfall dafuer steht in §3.8.1 (`_lib/helferSitzung.test.ts`) — ohne ihn
 * faellt die Verschaerfung erst am Cutover-Abend auf, und dann allen.
 */
export type HelferSitzung = HelferPayload & { laeuftAb: Date };
```

Heute trägt das JWT `{ tokenId, code, label }` (`src/lib/auth/helferSession.ts:6,11`), und `code` ist
genau der Wert, den der Implementierungsplan als „das Etikett *ist* das Secret" bezeichnet. Er kann
weg, weil §3.4.4 auf jedem Lesepfad ohnehin die Token-Zeile aus der Datenbank holt — `code` und
`label` kommen ab jetzt von dort. **Aufrufer, die das merken:** `src/app/helfer/layout.tsx:10` und
`src/app/a/[artikelId]/page.tsx:24` bauen ihr `Zugang: Token <code> · <label>` aus der Nutzlast, und
der Schreibweg setzt `quelle_id = code` für Token-Buchungen (aufgelöst über `tokens.code` in
`src/db/quelle.ts:20,23`). Alle drei lesen künftig den Rückgabewert des Rechecks.

**Rückwärtskompatibel, und das ist der Punkt.** `verifyHelferSitzung` verlangt **nur**
`typeof tokenId === "string"` und ignoriert überzählige Felder. Ein Alt-Cookie mit
`{ tokenId, code, label }` verifiziert damit unverändert weiter — das Geheimnis ist dasselbe, der
Name ist derselbe, die Signatur passt. Ohne diese Eigenschaft wäre die Übernahme des Geheimnisses
wirkungslos. **Die Gegenmutation ist teuer und unsichtbar:** eine strikte Feldprüfung auf genau
`{tokenId}` beendet jede laufende Feld-Sitzung beim Cutover, und **kein anderer Test sieht das** —
deshalb der eigene Testfall in §3.8.1.

**Gültigkeit: unverändert `LAGERBUCH_HELFER_SITZUNG_STUNDEN`, Vorgabe 12** (`src/lib/config.ts:39`).
Der Wert steht **zweimal** in derselben Sitzung: als JWT-`exp` (`helferSession.ts:14`) und als
Cookie-`maxAge` (`:33`).

**Erneuerung: keine gleitende, und keine ohne erneute Code-Eingabe.** Begründung: das Cookie ist der
Stellvertreter des laminierten Kärtchens. Ein gleitendes Fenster machte aus einem verlorenen
Kärtchen einen dauerhaften Schlüssel — und der Finder liest heute schon bis zu 12 h lang den
gesamten Bestand. **Verlängerung heißt: den Code erneut eingeben**, und das ist keine
Einschränkung, sondern der Beweis, dass das Kärtchen noch da ist. ⚠️ **Das schließt einen Knopf, der
den Code neu abfragt, ausdrücklich NICHT aus** — §7.4.4 baut genau den, inline im Abschlussbereich
des Fahrzeug-Checks; er durchläuft dasselbe Rate-Limit, dieselbe Normalisierung und dieselbe
Protokollzeile wie das Gate. Ausgeschlossen ist allein die Verlängerung **ohne** Code.

Der Preis ist der Ablauf mitten im Fahrzeug-Check. Er wird an zwei Stellen bezahlt, und beide sind
hier vorgeschrieben:

1. **Der Helfer-Rahmen zeigt die Restzeit** und ab 30 Minuten Restlaufzeit einen benannten Hinweis
   („Dein Zugang läuft um HH:MM ab. Scanne das Kärtchen erneut, bevor du den Check abschließt.").
   Die Gestaltung gehört §7; die **Existenz** des Hinweises ist hier festgeschrieben.

   **Der Datenpfad dazu, vollständig — sonst ist die Zusage nicht baubar:** `verifyHelferSitzung`
   gibt `HelferSitzung = HelferPayload & { laeuftAb: Date }` zurück (oben), `helferZugangOderNull`
   und `requireHelferSitzung` reichen `laeuftAb` als vierte Angabe des `HelferZugang` durch
   (§3.4.4), und `HelferRahmen` führt es als **Pflicht-Prop** (§7.8.2). Die Uhrzeit selbst
   formatiert `uhrzeit()` aus `_lib/zeit.ts` (§4.5) — Zonenrechnung hat genau eine Heimat, und
   „HH:MM" ist welche. Die 30-Minuten-Schwelle entscheidet eine Client-Insel `_ui/Restzeit.tsx`,
   weil eine serverseitig getroffene Entscheidung während eines zwanzigminütigen Fahrzeug-Checks
   nie neu getroffen würde — und genau dieser Check ist der Anlass des Hinweises. Der Prüfpunkt
   steht in §7.12.3.
2. **Der Fehlervertrag der schreibenden Actions.** Läuft die Sitzung zwischen Eingabe und Absenden
   ab, antwortet `checkAbschluss`/`bucheEntnahmeHelfer` mit einem **benannten Fehlerzustand am
   Formular** (`useActionState`), **nicht** mit `redirect()`. Ein Redirect verwürfe die eingetragenen
   Mengen — genau der Datenverlust, den `docs/design/README.md` unter „Kommen Fehler aus
   Server-Actions am Feld an?" ausdrücklich ausschließt. Der Grund heißt `sitzung` (§7.3) und trägt
   den Satz „Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben
   stehen." plus das Inline-Feld aus §7.4.4.

**Widerruf: über `tokens.aktiv`, und ab jetzt sofort auch lesend** (§3.4.4). Ein Einzel-Widerruf
je Sitzung wird **nicht** gebaut: ein Code wird von mehreren Menschen gleichzeitig benutzt, „diese
eine Sitzung" ist fachlich keine Einheit. Ein `jti` hätte darum keinen Leser und fällt aus
demselben Grund weg.

⚠️ **Bleibende Lücke, benannt statt übersehen:** ändert der Betreiber
`LAGERBUCH_HELFER_SITZUNG_STUNDEN`, tragen bereits ausgestellte Cookies weiter das alte `exp`. Der
einzige globale Sofort-Widerruf ist eine Rotation des Sitzungsgeheimnisses; sie beendet jede
Feld-Sitzung. Beides gehört ins Runbook, nicht in den Code.

#### 3.4.4 Der Sperrbefund wirkt ab jetzt auch lesend

**Entschieden: Entscheidung 13, Option (b).** Das folgt dem Hinweis der Analyse selbst („Der Port
macht (b) billiger als heute"): die Helfer-Prüfung wandert ohnehin aus der Edge in den
Node-Kontext, wo der DB-Recheck ohne Zusatzaufwand möglich ist. Es ist damit keine Abweichung,
sondern der Grund, warum die Frage überhaupt offen war.

Heute prüft `getHelferPayload` (`src/actions/session.ts:14-18`) nur Signatur und Ablauf; nur die
zwei schreibenden Stellen (`src/actions/buchung.ts:83`, `src/actions/check.ts:73`) machen den
DB-Recheck. Ein gesperrter Code liest damit bis zu 12 h weiter den gesamten Bestand — was passiert,
wenn ein laminiertes Etikett aus einem Fahrzeug verschwindet.

```ts
// src/app/m/lagerbuch/_lib/helferZugang.ts
export type HelferZugang = {
  tokenId: string;
  code: string;
  label: string;
  /**
   * Ablauf DIESER Sitzung, aus dem `exp` des verifizierten Cookies (§3.4.3).
   * Die einzige Angabe hier, die NICHT aus der Token-Zeile stammt — mit Absicht:
   * die Sperrung wirkt sofort und kommt deshalb aus der Datenbank, der Ablauf
   * steht seit der Ausstellung fest und kommt deshalb aus dem Cookie.
   * Sie kostet keinen zusaetzlichen Zugriff und traegt die Restzeit-Anzeige
   * des Helfer-Rahmens (§3.4.3 Punkt 1, §7.8.2).
   */
  laeuftAb: Date;
};

/**
 * DIE AUTORITATIVE HELFER-PRUEFUNG — Host, Cookie-Signatur, Ablauf UND `tokens.aktiv`.
 *
 * ERSTE Anweisung ist IMMER `requireLagerbuchHost(headers)` (§2.6): nur so ist
 * die Zusage „jede Helfer-Action ist host-gebunden" durch Konstruktion wahr und
 * nicht durch eine Liste, die die naechste Action vergisst.
 *
 * Der DB-Recheck steht heute nur vor schreibenden Aktionen (`session.ts:20-28`),
 * und das WAR die Spezifikation („der eine DB-Lookup pro Buchung"). Er wandert
 * auf jeden Lesepfad, weil der Riegel den Edge-Kontext verlaesst: dort war kein
 * DB-Zugriff moeglich, hier ist er einer von vielen auf derselben Seite. Der
 * Lookup geht ueber den Primaerschluessel `tokens.id` und liegt in derselben
 * SQLite-Verbindung, die die Seite ohnehin oeffnet.
 *
 * `code` und `label` kommen aus DIESER Zeile, nicht mehr aus der JWT-Nutzlast
 * (§3.4.3) — das ist der Grund, warum das Klartext-Secret aus dem Cookie
 * verschwinden konnte.
 */
export async function helferZugangOderNull(db: DB): Promise<HelferZugang | null> { … }

/** Fuer Layouts und Seiten: leitet ans Gate, mit benanntem Grund (§3.9). */
export async function requireHelferSitzung(db: DB): Promise<HelferZugang> { … }

/**
 * Fuer schreibende Actions. WIRFT NICHT, sondern liefert ein Ergebnis (§7.3) —
 * bis zur Portierung warf dieser Riegel (session.ts:25,28), und ein Wurf liess
 * sich nicht uebersehen. Ein Rueckgabewert schon: `await requireHelferSchreibend(db)`
 * ohne Pruefung ist typkorrekt, lint-sauber und oeffnet die Action fuer jeden.
 * Das einzige Netz dagegen ist der E2E „gesperrter Token wird an der Buchung
 * abgewiesen" (§3.8.3) — deshalb steht der Aufruf in BEIDEN Actions als erste
 * Anweisung, mit ausgeschriebenem Kommentar.
 */
export async function requireHelferSchreibend(db: DB):
  Promise<{ ok: true; zugang: HelferZugang } | { ok: false; grund: "sitzung" | "gesperrt" }> { … }
```

Die Unterscheidung `sitzung` (kein/ungültiges Cookie) gegen `gesperrt` (Cookie gültig, Zeile
gesperrt) ist nicht kosmetisch: im ersten Fall hilft ein erneutes Einlösen, im zweiten nicht — und
genau daran hängt, ob §7.4.4 das Inline-Feld überhaupt anbietet.

**Was ein Helfer sieht, der während laufender Sitzung deaktiviert wird:**

| Pfad | Verhalten |
|---|---|
| Nächster Aufruf von `/helfer/*` oder `/a/<id>` | `redirect("/abmelden?grund=gesperrt")` — **nicht** unmittelbar aufs Gate. Der Route Handler `/abmelden` räumt das Cookie und antwortet mit 303 auf `/?grund=gesperrt`; das Gate zeigt „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." Ein totes Cookie darf nicht liegen bleiben — **und der Umweg ist der Grund, warum das überhaupt möglich ist** (siehe unten). |
| Laufende schreibende Action | benannter Fehler am Formular, kein Redirect, Eingaben bleiben stehen (derselbe Vertrag wie beim Ablauf, §3.4.3) — **ohne** Inline-Feld, weil ein erneutes Einlösen desselben Codes genauso scheitert (§7.4.4) |
| `/t/<code>` mit demselben, gesperrten Code | `redeemToken` liefert `{ ok: false }` (`token-redeem.ts:15`) → Gate mit `?grund=code` |

**Warum die Löschung einen eigenen Route Handler braucht — gemessen, nicht vermutet.**
`requireHelferSitzung` wird aus `helfer/layout.tsx` gerufen (§7.4.3), und das ist eine **Server
Component**. `cookies()` ist dort versiegelt: `delete`, `set` und `clear` sind durch einen Proxy
ersetzt, der wirft — `next/dist/server/web/spec-extension/adapters/request-cookies.js:53` trägt den
Satz „Cookies can only be modified in a Server Action or Route Handler" wörtlich, `:171` hängt den
Riegel an `cookies().delete` (nachgeschlagen im Arbeitsbaum, Next 16.2.11, `package.json:28`). Ein
`cookies().delete(HELFER_COOKIE)` an der Stelle, an der der Sperrbefund auffällt, ist also nicht
„unsauber", sondern ein Laufzeitfehler — und die Playwright-Zusage aus §3.8.3 prüfte eine Zusage,
die die vorgeschriebene Bauform nicht halten kann.

**Entschieden: ein Route Handler, kein Streichen der Zusage.** Er kostet eine Datei mit zwölf
Zeilen und macht aus einer unhaltbaren Zusage eine geprüfte.

```ts
// src/app/m/lagerbuch/abmelden/route.ts   — aeusserer Pfad: /abmelden
export const dynamic = "force-dynamic";

/**
 * DER EINZIGE WEG, auf dem ein totes Helfer-Cookie unfreiwillig verschwindet.
 *
 * WARUM NICHT UNTER `t/`: `t/[code]/route.ts` ist ein dynamisches Segment, und
 * ein `t/abmelden/route.ts` daneben gewaenne zwar (statisch schlaegt dynamisch),
 * legte aber eine Falle in einen Pfad, der auf laminierten Kaertchen steht.
 * `/abmelden` steht auf keinem Gegenstand und ist deshalb frei waehlbar (§2.7).
 *
 * WARUM GET UND KEINE SERVER ACTION: der Aufrufer ist ein `redirect()` aus einer
 * Server Component — die kann keine Action ausloesen. Der freiwillige Weg bleibt
 * davon unberuehrt: `beenden` in `_actions/sitzung.ts` ist und bleibt eine
 * Server Action hinter einem POST (§3.8.2, Ausnahme 3).
 *
 * ⚠️ EIN `<Link href="/abmelden">` IST HIER FALSCH: Nexts Prefetch fordert das
 * Ziel beim blossen Darueberfahren an und beendete die Sitzung ungefragt. Wer je
 * einen sichtbaren Abmelden-Weg baut, nimmt das POST-Formular auf `beenden`.
 *
 * ⚠️ ANGENOMMENE RESTLUECKE, benannt statt weggeschrieben: ein GET-Endpunkt, der
 * ein Cookie raeumt, ist von fremden Seiten ausloesbar (ein `<img src=…>`
 * genuegt; `SameSite=Lax` verhindert das Setzen des `Set-Cookie` nicht). Der
 * Schaden ist genau: die Helferin muss ihr Kaertchen erneut eingeben — und §7.4.4
 * faengt das inline ab, ohne die gezaehlten Mengen zu verlieren. Ein CSRF-Token
 * auf einem Abmeldeweg waere teurer als der Schaden.
 */
export async function GET(req: Request) {
  const kopf = new Headers(req.headers);
  if (!lagerbuchHostOderNull(kopf)) return new Response("Not found", { status: 404 });  // §2.6

  const roh = new URL(req.url).searchParams.get("grund");
  const grund = istGateGrund(roh) ? roh : null;   // §3.9 — geschlossener Satz, nie durchgereicht
  const antw = new NextResponse(null, {           // 303 + RELATIVES Location, wie §7.2.3
    status: 303, headers: { Location: grund ? `/?grund=${grund}` : "/" },
  });
  antw.cookies.set(HELFER_COOKIE, "", helferCookieOptionen(0));   // maxAge 0 = loeschen
  return antw;
}
```

`helferCookieOptionen(0)` statt `cookies.delete(...)`: die Attribute müssen beim Löschen dieselben
sein wie beim Setzen (`path`, kein `domain`, §3.4.2), und die eine Funktion, die das garantiert,
gibt es schon. Es ist zugleich die Form, die `feedback` benutzt (`m/feedback/actions.ts:638`:
`set(name, "", { maxAge: 0, path: "/" })`). Die drei Zeilen des 303-Baus stehen damit in **zwei**
Handlern; die vollständige Begründung dafür steht genau einmal, in §7.2.3.

**Wer den Umweg nimmt und wer nicht.** `requireHelferSitzung` nimmt ihn in beiden toten Lagen —
`gesperrt` und `abgelaufen` —, aber **nur, wenn ein Cookie da war**: fehlt es ganz, gibt es nichts
zu räumen und der Redirect geht unmittelbar aufs Gate. `requireHelferSchreibend` nimmt ihn nie: es
leitet nicht um, sondern gibt zurück (§7.3), und der nächste Seitenaufruf läuft ohnehin durch das
Layout.

Der Sperrbefund ist damit **der** Sofort-Widerruf des Moduls — und er ist es genau deshalb, weil er
aus der Datenbank kommt und nicht aus dem Token. Das ist die Gegenprobe zur Gruppenfrische in §3.6.

#### 3.4.5 Der Helfer-Token trägt keine Zugriffsgrenze — und was daraus für die Nutzlast folgt

**Der Zugang ist heute organisationsweit, nicht codeweit, und das bleibt so.** `requireHelfer`
(`src/actions/session.ts:22-28`) gibt `{tokenId, code}` zurück — **keinen Lagerort**;
`checkAbschluss` (`src/actions/check.ts:73`) nimmt danach jede beliebige `fahrzeugId` entgegen, und
die Zugehörigkeitsprüfungen im Rumpf prüfen Soll-Positionen, Geräte, Flaschen und Verfälle
**gegen dieses Fahrzeug**, nie das Fahrzeug gegen den Token. `/helfer/check` listet ohnehin alle
aktiven Fahrzeuge (`src/app/helfer/check/page.tsx:14`). Das Schemafeld `tokens.scope_lagerort_id`
(`src/db/schema.ts:136`) suggeriert das Gegenteil, wird aber von keinem Produktionspfad geschrieben
— es ist ein nicht zurückgebauter Planrest. §3.10 verwirft es als Riegel; **die Spalte selbst bleibt
im Schema** (§4.12), und die Fortschreibung gehört ins Modul-README, nicht in einen halb gebauten
Riegel.

**Die Folge für den Datenumfang ist aber sehr wohl ein Posten dieser Spec** — und sie fällt in
dieselbe Denkrichtung wie die gekürzte JWT-Nutzlast (§3.4.3) und der DB-Recheck (§3.4.4): so wenig
mitschicken wie nötig. `src/app/helfer/check/page.tsx:16,19-21,23,24-26` baut vier
`Object.fromEntries(fahrzeuge.map(...))`-Wörterbücher — Soll-Bestückung, Geräteliste,
Flaschenliste und Verfallswerte **aller** aktiven Fahrzeuge — und reicht sie vollständig als Props
an die Client-Komponente (`CheckFlow.tsx:50-58`); `?fz=` wirkt nur als Vorauswahl
(`page.tsx:28`). Bei jedem Helfer-Aufruf wandert damit die komplette Bestückung der Organisation in
den RSC-Payload.

**Vorschrift: der Payload wird auf das gewählte Fahrzeug geschnitten.** Sie steht hier, weil ihr
*Anlass* hier steht — ohne Zugriffsgrenze am Token ist die Payload-Größe die einzige verbleibende
Begrenzung dessen, was ein gefundenes Kärtchen preisgibt. Die *Umsetzung* steht in §7.9.1, und sie
hat ein Zeitfenster: der Flow wird für antd ohnehin angefasst, und nachzurüsten heißt, ihn ein
zweites Mal umzubauen. **Kein Gate findet das** — die Seite ist korrekt, typkorrekt und schnell,
solange die Testdaten klein sind.

#### 3.4.6 `/t/<code>` — der einzige Weg in die Sitzung

Fünf Festlegungen, jede gegen einen benannten Befund. Der vollständige Handler steht in §7.2.3.

1. **Erste Anweisung: `lagerbuchHostOderNull(req.headers)`**, sonst `new Response("Not found", {
   status: 404 })`. Nicht `requireLagerbuchHost` — ein `notFound()`-Wurf ist im Antwortweg eines
   Handlers keine brauchbare Antwort (`m/files/_lib/hostRolle.ts:30-32`).
2. **Redirect und Cookie relativ, nicht gegen eine absolute Basis-URL.** Heute baut
   `src/app/t/[code]/route.ts:19,30` beides gegen `config.appBaseUrl`; die Suite kennt den Namen
   nicht einmal, und `AUTH_URL` ist auf jedem Modul-Host **derselbe** Wert
   (`core/auth/redirect.ts:8-11`). Wer `appBaseUrl` unbesehen darauf mappt, setzt das Cookie auf
   `lagerbuch.iuk-ue.de` und leitet auf `iuk-ue.de/helfer` weiter — Cookie hier, Landung dort, die
   Helferin steht ohne Sitzung am Gate. Der relative Weg ist im Repo bereits erprobt
   (`src/app/(gate)/actions.ts:23-24`, `src/middleware.ts:19,31`) und bleibt im Mehrhost-Betrieb von
   selbst richtig.

   **Konkret — und `NextResponse.redirect(new URL(ziel, req.url))` ist hier ausdrücklich FALSCH:**
   `NextResponse.redirect` verlangt eine **absolute** URL und baut sie aus der übergebenen Basis.
   `req.url` trägt in der Suite nach dem Host-Rewrite die **interne** Adresse —
   `m/files/_lib/hostRolle.ts:137-139` schreibt genau das aus („`req.url` trägt nach dem Rewrite
   immer die interne http-Adresse", belegt an `m/feedback/_ui/Teilnahme.tsx:50-53`), und `files`
   rekonstruiert deshalb über `resolveHost(headers)` und `x-forwarded-proto`. Ein `Location` mit
   interner Herkunft ist genau der cross-origin-Sitzungsverlust, den dieser Punkt beseitigen soll —
   nur mit einer anderen Ursache als heute.

   **Ein relativer `Location` löst das ohne Rekonstruktion.** RFC 7231 §7.1.2 erlaubt eine relative
   Referenz im `Location`-Kopf; der Browser löst sie gegen die angefragte URL auf, also gegen den
   Host, unter dem das Etikett gescannt wurde — dieselbe Herkunft, auf die `antwort.cookies.set` das
   Cookie legt. Cookie und Landung können damit **konstruktiv** nicht auseinanderfallen. Das ist
   auch der Grund, warum der zweite Einlöseweg im Bestand nie betroffen war:
   `src/app/(gate)/actions.ts:24` benutzt `redirect()`, und das ist ebenfalls relativ.
   `oeffentlicheUrl` und die Host-Rekonstruktion braucht lagerbuch nur dort, wo eine Adresse
   **erzeugt** wird (gedruckte QR-Codes) — das ist §8, nicht dieses Kapitel.
3. **Reihenfolge: Host → Sperrprüfung → Codeprüfung → Fehlerbudget.** Der Budgetverbrauch liegt
   **hinter** der Codeprüfung und trifft nur Fehlversuche (§3.5.3).
4. **Der Code wird normalisiert, und zwar auch der Bindestrich** (§7.5.3). Heute normalisiert
   `redeemToken` mit `trim().toUpperCase()` (`token-redeem.ts:13`) — auf einer reinen Ziffernfolge
   wirkungslos — und sucht auf Gleichheit; die Eingabe `123456` findet `123-456` nicht, obwohl der
   Generator den Bindestrich fest zwischen Position 3 und 4 setzt (`src/actions/tokens.ts:15`). Neu:
   `normalisiereCode` aus `_lib/code.ts` bringt die **Eingabe** auf die Erzeugerform; die Suche
   bleibt eine Gleichheitssuche gegen `tokens.code`. Das ist nicht Bequemlichkeit, sondern die
   billigste Maßnahme gegen einen geteilten Fehlversuchs-Eimer.
5. **Mehrfachgebrauch bleibt** — `rateLimit.ts:1-3` begründet den Verzicht auf Redis ausdrücklich
   damit, dass Codes physisch laminiert und sofort sperrbar sind, und kein Test behauptet
   Einmalgebrauch. `last_used_at` wird weiterhin geschrieben, entscheidet aber über **nichts**:
   nicht über Gültigkeit — das tut allein `tokens.aktiv`, und der wirkt ab jetzt auch lesend
   (§3.4.4) — und seit Entscheidung 8-F (§8.3) auch nicht mehr über Löschbarkeit, denn den
   Hard-Delete für Tokens gibt es nach dem Port nicht mehr (`src/actions/loeschen.ts:89-99`
   entfällt). Es bleibt ein **Anzeigefeld** mit genau einem Leser: „nie benutzt" gegen „zuletzt
   <Zeitstempel>" (`TokenTable.tsx:67`).

### 3.5 Das Rate-Limit am Gate

Der Betreiber hat am 03.08. beantwortet, was die Analyse offen ließ: **der Suite-Container ist auf
dem Server direkt erreichbar**, also an Cloudflare und Traefik vorbei. Diese Antwort wählt keine der
beiden vorhandenen Richtungen aus — **sie zeigt, dass beide unter dieser Topologie falsch sind**, und
genau das ist die Entscheidung, die hier steht.

#### 3.5.1 Warum beide Bestandslösungen ausscheiden

| Quelle | Durch die Proxy-Kette | Bei Direktzugriff |
|---|---|---|
| **rechtester `x-forwarded-for`-Eintrag** (lagerbuch, `src/lib/auth/rateLimit.ts:29-35`) | Traefik hängt die Peer-Adresse an; das ist die Cloudflare-Edge und für **alle** Clients derselbe Wert → **ein globaler Eimer**, genau der Zustand, den `lagerbuch/deployment.md:60-64` als Fehlerfall beschreibt | frei vom Anfragenden setzbar → **ein neuer Eimer pro Versuch** |
| **erster `x-forwarded-for`-Eintrag** (Suite, `core/ratelimit.ts:60`) | richtig, solange Cloudflare den Header setzt | frei vom Anfragenden setzbar → **ein neuer Eimer pro Versuch** |

Die CWE-348-Begründung in `src/lib/auth/rateLimit.ts:23-28` ist **richtig gedacht für eine andere
Topologie** — sie nimmt genau einen vertrauenswürdigen Reverse-Proxy an, und
`deployment.md:60-64` macht das zur Betriebsauflage. Die Suite-Fassung ist **richtig für die vier
laufenden Module**, die hinter Cloudflare stehen. Keine der beiden ist richtig für ein Gate mit
sechsstelligem Code auf einem direkt erreichbaren Container.

#### 3.5.2 Entschieden: `cf-connecting-ip` oder ein konstanter Sammelschlüssel — nie `x-forwarded-for`

```ts
// src/app/m/lagerbuch/_lib/absender.ts
/**
 * Der Buendelungsschluessel des Gate-Fehlerzaehlers. NICHT „die Client-IP" —
 * der Name sagt bewusst nicht mehr, als der Wert traegt.
 *
 * WARUM `x-forwarded-for` HIER GAR NICHT VORKOMMT — in keiner Richtung:
 * der Suite-Container ist auf dem Server direkt erreichbar (Betreiber,
 * 03.08.2026). Wer ihn direkt erreicht, setzt den Header vollstaendig selbst.
 * Den ERSTEN Eintrag zu nehmen (`core/ratelimit.ts:60`) oder den LETZTEN
 * (`lagerbuch/src/lib/auth/rateLimit.ts:29-35`) macht dabei keinen Unterschied:
 * beide ergeben einen frischen Eimer je Versuch. Beide Begruendungen sind fuer
 * ihre jeweilige Topologie richtig und fuer diese hier falsch.
 *
 * `cf-connecting-ip` setzt Cloudflare. Er ist damit fuer jede Anfrage DURCH die
 * Kette der echte Absender — und fuer eine Anfrage am Rand vorbei ebenso
 * faelschbar wie alles andere. Er ist also eine Buendelung, kein Beweis; in
 * `files` heisst die entsprechende Spalte aus demselben Grund
 * `client_ip_unbestaetigt` (`core/ratelimit.ts:52-55`).
 *
 * OHNE JEDEN KOPF ein KONSTANTER Wert: alle kopflosen Aufrufer teilen sich EINEN
 * Eimer. Das ist der sichere Ausfallmodus — er kann nur zu STRENG sein, nie zu
 * lasch. Fuenf FEHLVERSUCHE pro Minute fuer alle direkt Anfragenden zusammen;
 * ein richtiger Code funktioniert dabei immer (§3.5.3).
 *
 * Der Praefix `cf:` trennt die Namensraeume: ohne ihn koennte ein gefaelschter
 * `cf-connecting-ip: direkt` den Sammel-Eimer der kopflosen Aufrufer mitbenutzen
 * oder umgekehrt verstopfen.
 */
export function absenderAus(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  return cf ? `cf:${cf}` : "direkt";
}
```

**Ausgesprochen, statt weggeschrieben: der Absenderschlüssel bleibt umgehbar.** Wer den Container
direkt erreicht, fälscht `cf-connecting-ip` und rotiert ihn. Der Per-Absender-Zähler ist damit eine
Bequemlichkeitsgrenze gegen Tippfehler und ungezieltes Klopfen — **nicht** die
Brute-Force-Abwehr. Die Abwehr sind die beiden modulweiten Zähler in §3.5.3, weil ihr Schlüssel der
einzige ist, den niemand rotieren kann.

⚠️ **Die Betriebsauflage, die die Restlücke schließt und die diese Spec nicht selbst lösen kann:**
solange der Container aus dem lokalen Netz an Traefik vorbei erreichbar ist, ist jeder
Absenderschlüssel fälschbar. Der Riegel dagegen ist kein Code, sondern eine Netzentscheidung — kein
Host-Port-Mapping am Suite-Dienst (`iuk-suite/compose.yaml` führt für `suite` heute keins), und der
Traefik-Entrypoint nur aus den Cloudflare-Bereichen erreichbar. → **Runbook-Schritt** mit
Gegenprobe: von einem Rechner im lokalen Netz gegen den Entrypoint anfragen, mit gesetztem
`CF-Connecting-IP`; erwartet wird keine Antwort. Bleibt der Weg bewusst offen, steht die Restlücke
ausgeschrieben in der Cutover-Übergabe.

#### 3.5.3 Drei Zähler, und sie zählen nur Fehlversuche

```ts
// src/app/m/lagerbuch/_lib/gateSchranke.ts
import { RateLimiter } from "@/core/ratelimit";
import { grenzen } from "./grenzen";

/** 1:1 die heutige Zusage: 5 Fehlversuche je Absender und Minute (`rateLimit.ts:4-5`).
 *  Env: LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN (§10.3). */
const g = grenzen();   // §10.3 — die drei Werte kommen aus der Env, nicht aus dem Code
const proAbsender = new RateLimiter({ windowMs: 60_000, max: g.gateProAbsenderProMin });

/**
 * Modulweit ueber die Minute, gegen Rotation des Absenderschluessels — die
 * BURST-Kappe, nicht die eigentliche Abwehr (das ist `gateStunde`).
 * 30 = sechs Absender-Budgets.
 * Env: LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN, Vorgabe 30.
 *
 * WARUM EINE MODULWEITE MINUTENSPERRE VERTRETBAR IST, obwohl sie alle trifft:
 * sie kann nur Fehleingaben verzoegern. Der Budgetverbrauch liegt HINTER der
 * Codepruefung (Schritt 4 vor Schritt 5 unten) — ein RICHTIGER Code wird
 * eingeloest, auch waehrend die Sperre laeuft. Der Sprengradius ist damit
 * genau: „wer sich vertippt, wartet bis zu eine Minute". 30 statt 20 ist
 * Kopffreiheit fuer den realen Fall, den `feedback` schon einmal getroffen hat:
 * mehrere Ehrenamtliche geben gleichzeitig von Hand ein und vertippen sich.
 */
const gateMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });

/**
 * Modulweit ueber die Stunde — DER tragende Zaehler.
 * 300 = 5/min x 60. Die Zahl ist nicht gegriffen: sie stellt genau die Zusage
 * WIEDER HER, die das Per-IP-Limit nur unter der Annahme einer wahrhaftigen
 * Absenderadresse je hatte. Der schlimmste Fall nach dieser Spec (unbegrenzte
 * Rotation) ist damit nicht schlechter als der beste Fall heute (ein Absender).
 * Env: LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE, Vorgabe 300.
 */
const gateStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

/**
 * DIE LESBARE SPERRZEIT — der Speicher, ohne den Schritt 2 unten gar nicht geht.
 * Schluessel -> Zeitpunkt in ms, bis zu dem dieser Eimer als erschoepft gilt.
 *
 * `RateLimiter.check()` prueft und BUCHT in einem Zug (`core/ratelimit.ts:26-37`);
 * ein reines Nachsehen gibt es dort nicht. Deshalb merkt sich diese Datei jedes
 * `false` selbst, und Schritt 2 liest nur noch diese Zahl — ohne zu buchen und
 * ohne Datenbankzugriff.
 */
const gesperrtBis = new Map<string, number>();

/** Die beiden modulweiten Schluessel sind Konstanten DIESER Datei und gehen
 *  keinen Aufrufer etwas an — deshalb nimmt keine der beiden Funktionen sie
 *  entgegen. */
const MODULWEIT_MIN = "modul:minute";
const MODULWEIT_STD = "modul:stunde";

function restMs(schluessel: string, jetzt: number): number {
  const bis = gesperrtBis.get(schluessel);
  if (bis === undefined) return 0;
  if (bis <= jetzt) { gesperrtBis.delete(schluessel); return 0; }   // laeuft von selbst ab
  return bis - jetzt;
}

/**
 * SCHRITT 2 der Reihenfolge unten. LIEST nur — bucht nichts, oeffnet nichts.
 *
 * Rueckgabe: die verbleibenden SEKUNDEN, aufgerundet und MINDESTENS 1, wenn
 * einer der drei Eimer gesperrt ist; sonst `null`. Nie 0: ein `if (gateGesperrt(…))`
 * waere sonst in der letzten Sekunde still falsch. Die Aufrufer pruefen trotzdem
 * ausdruecklich gegen `null` (§7.2.3, §7.2.4) — die Zusage steht im Typ, nicht in
 * der Wahrheitswertumwandlung.
 *
 * Zurueck kommt die GROESSTE der drei Restzeiten: wer den Stundendeckel gerissen
 * hat, soll nicht „noch 12 Sekunden" lesen.
 *
 * Diese Zahl ist das *n* aus dem Text zu `grund=zuviele` (§3.9). Sie wird NICHT
 * ueber die URL getragen — die Gate-Seite fragt dieselbe Schranke mit denselben
 * Absender-Kopfzeilen selbst (§7.2.4).
 */
export function gateGesperrt(absender: string): number | null {
  const jetzt = Date.now();
  const ms = Math.max(restMs(absender, jetzt),
                      restMs(MODULWEIT_MIN, jetzt), restMs(MODULWEIT_STD, jetzt));
  return ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : null;
}

/**
 * SCHRITT 6: ein FEHLVERSUCH wird gebucht — nie ein Erfolg. Genau das macht den
 * modulweiten Deckel vertretbar (siehe oben).
 *
 * Die Kette ist kurzschliessend: ein bereits gesperrter Absender verbraucht das
 * modulweite Budget nicht mit, sonst legte ein einzelner Klopfer die Ausgabe
 * fuer alle lahm. Jedes `false` schreibt die FENSTERLAENGE als Sperrzeit fort —
 * bewusst konservativ: es laeuft dann die Sperre ab, nicht der gleitende Eimer.
 */
export function gateFehlversuchBuchen(absender: string): void {
  const jetzt = Date.now();
  if (!proAbsender.check(absender))    { gesperrtBis.set(absender,      jetzt +    60_000); return; }
  if (!gateMinute.check(MODULWEIT_MIN)) { gesperrtBis.set(MODULWEIT_MIN, jetzt +    60_000); return; }
  if (!gateStunde.check(MODULWEIT_STD)) { gesperrtBis.set(MODULWEIT_STD, jetzt + 3_600_000); }
}
```

**Das sind die einzigen zwei Exporte der Datei.** Die drei `RateLimiter` und die `Map` bleiben
modul-intern; ein vierter Aufrufer, der selbst buchen will, ist damit konstruktiv ausgeschlossen.
⚠️ Beide Funktionen lesen `Date.now()` — dieselbe Uhr, die auch `RateLimiter` per Vorgabe benutzt
(`core/ratelimit.ts:22`). `vi.setSystemTime` steuert deshalb beide Hälften zugleich, und nur so ist
die Zeile „nach Fensterende geht es weiter" aus §3.8.1 ohne echte Wartezeit prüfbar. Weil die
Zähler Modul-Singletons sind, beginnt jeder Fall dieser Testdatei mit `vi.resetModules()` und einem
frischen `await import(...)` — sonst vergiftet der Fall, der einen Eimer leert, den nächsten.

**Die Reihenfolge ist der halbe Entwurf, und beide Hälften tragen einander:**

```
1. Host-Riegel                                    (§2.6)
2. gesperrt?  → ja: benannter Fehler, OHNE Datenbankzugriff
3. Code normalisieren                             (§7.5.3)
4. redeemToken(normalisierterCode, getDb())       (§7.13.2 — ein Handle, ein Weg: §5.13.2)
5. Erfolg → Cookie setzen, umleiten.  KEIN Budgetverbrauch.
6. Misserfolg → proAbsender && gateMinute && gateStunde buchen;
   erschoepft → Sperrzeit merken (= Fensterlaenge) und benannten Fehler zurueckgeben
```

**Warum der Verbrauch hinter die Codeprüfung wandert — der operative Grund zuerst.** Heute läuft
`consumeRate` **vor** jeder Codeprüfung (`src/app/(gate)/actions.ts:19`,
`src/app/t/[code]/route.ts:25`). Eine Bereitschaft hinter einem gemeinsamen Uplink — ein Anschluss
oder Mobilfunk hinter CGNAT — verbraucht ihre fünf Versuche pro Minute mit **erfolgreichen** Scans.
Genau dieser Fehler ist in dieser Suite bereits einmal produktiv eingetreten: `feedback` hat mit
einem IP-Limiter von 10/min „den Kernfall getötet" (15 Ehrenamtliche aus einem Vereins-WLAN,
`m/files/api/u/[token]/upload/route.ts:140-149` schreibt den Vorfall aus), und `files` hat daraus
genau die hier vorgeschriebene Bauform abgeleitet: „Deshalb liegt dieser Zähler HINTER der
Token-Auflösung: er wird nur angefasst, wenn kein gültiges Token vorlag" (`:147-149`).

**Und erst dadurch ist der globale Deckel überhaupt vertretbar.** Würden Erfolge mitzählen, wäre
ein modulweites Limit ein Ausfall der Ausgabe. So ist der Sprengradius scharf umrissen: **ein
richtiger Code funktioniert immer**, auch während eines Angriffs; wer sich vertippt, wird
vertröstet. Die beiden Hälften — „nur Fehlversuche" und „modulweiter Deckel" — sind deshalb nicht
zwei Maßnahmen, sondern eine.

**Warum Schritt 2 nicht entfallen darf — und warum er zugleich den DB-Zugriff schützt.**
`RateLimiter.check()` prüft und bucht in einem Zug (`core/ratelimit.ts:26-37`). Würde erst nach der
Codeprüfung gebucht und dabei nur die *Meldung* umgeschaltet, liefe die Codeprüfung selbst unbegrenzt
weiter — der Deckel änderte dann die Fehlermeldung und nicht den Angriff. Deshalb hält
`gateSchranke.ts` eine **lesbare Sperrzeit**: liefert `check()` für ein Fenster der Länge W ein
`false`, wird `gesperrtBis[schluessel] = jetzt + W` gesetzt, und Schritt 2 liest diese Zahl, ohne zu
buchen.

⚠️ **Genau hier liegt die Antwort auf den naheliegenden Einwand, der Absender-Eimer müsse vor der
Codeprüfung stehen, um den DB-Lookup zu schützen.** Er tut das nicht: ein Angreifer, der den
Absenderschlüssel rotiert, startet jeden Versuch mit **leerem** Absender-Eimer und bekäme so oder so
genau einen Lookup. Was den Lookup deckelt, sind ausschließlich `gateMinute` und `gateStunde` — und
sie tun es über Schritt 2, **vor** jedem Datenbankzugriff. Der Absender-Eimer verliert durch die
Verschiebung also nichts, was er je geleistet hätte, und gewinnt den `feedback`-Fall zurück.

**Die Kette ist kurzschließend (`&&`).** Ein bereits gesperrter Absender verbraucht das modulweite
Budget nicht mit — sonst legte ein einzelner Klopfer die Ausgabe für alle lahm.

**Was das gegen einen Coderaum von 10⁶ wert ist** (`src/actions/tokens.ts:10,15`: sechs Ziffern,
`NNN-NNN`). Bei K gleichzeitig aktiven Codes liegt die erwartete Zahl der Versuche bis zum ersten
Treffer bei rund 10⁶/K:

| aktive Codes K | erwartete Versuche | bei 300 Fehlversuchen/h |
|---|---|---|
| 10 | ~91.000 | ~13 Tage |
| 30 | ~32.000 | ~4,5 Tage |
| 100 | ~9.900 | ~1,4 Tage |

⚠️ **Runbook-Eingabe:** die Zahl der aktiven Codes in der produktiven Datenbank
(`select count(*) from tokens where aktiv = 1`). Sie steht nicht im Repo und verschiebt die letzte
Spalte um eine Größenordnung. Liegt sie oberhalb von etwa 60, gehört `gateStunde` gesenkt — die
Zahl ist deshalb eine benannte Env-Variable an genau einer Stelle und keine im Code verstreute 300.

**Zwei Vorbehalte, die mitwandern und bleiben.** Erstens sind alle drei Zähler **prozesslokal**
(`core/ratelimit.ts:6-11` schreibt den Vorbehalt aus). Im Suite-Container teilt lagerbuch den Prozess
mit allen anderen Modulen: **jeder Suite-Deploy setzt das Gate-Budget zurück**, nicht mehr nur ein
lagerbuch-Deploy — das sind spürbar mehr Gelegenheiten als früher. Zweitens: gäbe es je mehr als
eine Instanz, wäre der modulweite Deckel je Instanz einer. `compose.yaml` hat kein
`deploy:`/`replicas:`; wer skaliert, muss diese Voraussetzung zuerst auflösen.

#### 3.5.4 Ändert das etwas an `core`? Nein — und das ist die Antwort auf die Frage im Auftrag

**`core/ratelimit.ts` wird nicht angefasst.** Die `RateLimiter`-Klasse wird wiederverwendet,
`clientIpAus` nicht. Drei Gründe, in dieser Reihenfolge:

1. **Die vier laufenden Module stehen hinter Cloudflare, und dort ist `clientIpAus` richtig.**
   `feedback` (`m/feedback/actions.ts:117,119`, `:559`) und `files`
   (`m/files/api/u/[token]/upload/route.ts:344,375`, `m/files/_db/zaehler.ts:139`) benutzen es. Eine
   Änderung der Schlüsselbildung verschöbe stillschweigend die Eimer von vier produktiven
   Modulen. `feedback`s `${ip}|${surveyId}` mit 60/10 min ist nach einem Produktionsausfall
   kalibriert worden — genau so etwas ändert man nicht nebenbei.
2. **`core/ratelimit.test.ts:46-49` friert die Erst-Eintrag-Auswertung ausdrücklich ein** — am
   Arbeitsbaum nachgelesen, mit ausgeschriebener Mutationsbegründung darüber. Diese Zusage stammt
   aus derselben Topologie, die für die vier Module gilt.
3. **Die `core`-Regel verlangt einen zweiten, heute belegbaren Nutznießer** (`CLAUDE.md`,
   `docs/design/README.md`). Den gibt es für die lagerbuch-Sicht nicht: kein anderes Modul hat ein
   Gate mit einem sechsstelligen Klartext-Secret.

**Was für die vier laufenden Module gilt:** nichts ändert sich. Das ist die vollständige Antwort
auf „was heißt das für die vier?".

**Was NICHT gebaut wird, damit die Abwesenheit kein Versehen ist:** kein `SUITE_TRUSTED_PROXIES`,
kein konfigurierbarer Hop-Zähler, keine zweite Variante von `clientIpAus`. Die richtige Hop-Zahl
lässt sich aus dem Repo nicht ermitteln, und ein geratener Mechanismus ist schlechter als eine
benannte Grenze. **Wenn** die Suite diese Frage je beantwortet, ist der Ort `core` und der Anlass ein
zweites Modul — dann fällt `_lib/absender.ts` weg, und dieser Abschnitt ist seine Begründung.

`consumeRate` und `clientIp` aus `src/lib/auth/rateLimit.ts` **werden nicht portiert**; es gibt eine
Zähl-Implementierung in der Suite, und das ist `RateLimiter`. Der Wechsel von Token-Bucket zu
gleitendem Fenster ändert die Burst-Form (kein allmähliches Nachfüllen), nicht die Zusage „fünf
pro Minute". Die Spoofing-Zusicherung aus `rateLimit.test.ts:33-38` **wandert mit** und wird in
`_lib/absender.test.ts` in ihrer neuen Form abgelegt (§3.8) — ihr ersatzloses Löschen zusammen mit
der Datei ist laut Analyse die einzig ungesicherte Stelle an diesem Umbau.

### 3.6 Die Rollen

#### 3.6.1 Eine Stufe, ohne Suite-Admin-Abkürzung

**Entschieden nach Betreiber-Entscheidung 3: Lagerbuch-Admin ist ausschließlich, wer in
`SUITE_ADMIN_GROUP_LAGERBUCH` steht.** Der Suite-Admin bekommt **keine** Lagerbuch-Rechte. Das ist
das `feedback`-Muster seit dem 28.07.2026 (`m/feedback/_lib/access.ts:9-35`) und weicht damit von
Entscheidung 9 (b) der Analyse ab — die Betreiberantwort gewinnt (§0.2, Nr. 2).

```ts
// src/app/m/lagerbuch/_lib/zugang.ts — KEIN "use client" (Falle 6)
import { getModule } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";

export type Viewer = { sub: string; groups: string[]; name: string | null; email: string | null };

/**
 * Sitzung → Viewer, OHNE Wurf.
 *
 * BEWUSST NICHT aus `m/files/_lib/access.ts:107-113` kopiert: dort hat `Viewer`
 * ZWEI Felder (`sub`, `groups`), hier VIER. `merkeNutzer(db, viewer)` (§4.13)
 * schreibt `name` und `email` in `users`; eine zweifeldrige Kopie traegt still
 * `null` in beide Spalten und erzeugt damit den benannten Defektzustand aus
 * §4.13 — eine rohe `sub`-Kennung im Journal statt eines Namens. Die Werte
 * liegen an: `core/auth/config.ts:163-176` laesst `session.user.name/email`
 * unangetastet und setzt nur `groups`, `isAdmin` und `id`.
 *
 * Ohne `user.id` gibt es keinen Viewer; ein fehlender `groups`-Claim ist die
 * leere Menge und laeuft damit in den 404 des Riegels, nicht in einen 500 —
 * sonst haenge die Fehlerform an der Token-Version (§3.4.1).
 */
export function viewerAusSession(
  session: {
    user?: { id?: string; groups?: string[]; name?: string | null; email?: string | null };
  } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return {
    sub: id,
    groups: session.user?.groups ?? [],
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
  };
}

/**
 * DIE NICHT-WERFENDE FORM — fuer die beiden Rollen-Weichen `/a/[artikelId]` und
 * `/g/[code]` und fuer das Gate (§2.1 c, §3.2.1, §7.2.4).
 *
 * Diese drei Dateien haben je DREI gueltige Faelle, und der dritte ist immer
 * "keine Sitzung". `requireLagerbuchAdmin()` an ihrer Weiche schickte jeden
 * anonymen Scan eines Regaletiketts nach `/login` (§3.6.4) statt aufs Gate mit
 * `returnTo` (`a/[artikelId]/page.tsx:19`, `g/[code]/page.tsx:25`) — genau der
 * Ausfall, den `requiresAuth: false` (§2.3) verhindern soll, und er waere
 * typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar.
 *
 * ⚠️ SIE RUFT `requireLagerbuchHost` ABSICHTLICH NICHT. `requireLagerbuchAdmin`
 * tut es (§3.6.4), und wer es hier aus Analogie nachtraegt, verwandelt das
 * Praedikat zurueck in einen Wurf. Der Host-Riegel steht in allen drei
 * aufrufenden Dateien ohnehin als ERSTE Anweisung, vor dieser Funktion (§2.6).
 */
export async function viewerOderNull(): Promise<Viewer | null> {
  return viewerAusSession(await auth());   // `auth` aus `@/core/auth`
}

/**
 * BEWUSST NICHT `isModuleAdmin` aus `core/groups` — dieselbe Entscheidung wie in
 * `feedback` (`_lib/access.ts:9-30`), hier aus einem eigenen Anlass: hinter
 * `/verwaltung` liegen das Journal mit Klarnamen (`src/db/quelle.ts:12-25`) und
 * der Etikettenbogen mit den Token-Codes IM KLARTEXT — dem Secret selbst.
 * Betrieb und Einsicht sind zwei Rollen; wer den Server betreibt, hat damit noch
 * keinen Anlass, die Bewegungen einer Bereitschaft zu lesen oder Zugangscodes zu
 * drucken. Wer lagerbuch verwalten soll, gehoert in das, was
 * SUITE_ADMIN_GROUP_LAGERBUCH benennt — auch der Betreiber selbst.
 *
 * ES GIBT NUR DIESE EINE STUFE. Kein zweites Praedikat, keine
 * Zugehoerigkeitspruefung zwischen Verwaltenden; `tokens.created_by` und
 * `journal.quelle_id` sind Nachweis und Anzeige, nie Berechtigung. Wer hier
 * einen `assertGroupAccess`-Zwilling wie in `feedback` sucht: es gibt ihn nicht,
 * und das ist Absicht.
 *
 * UND BEWUSST NICHT DIE `files`-VERKNUEPFUNG: `requiredGroupsFor` wird NICHT
 * mitgelesen (§2.5, Punkt 3).
 *
 * `session.user.isAdmin` kommt in diesem Modul NIRGENDS vor. Ein 1:1-Port von
 * `src/lib/auth/cordon.ts:14-20` waere typkorrekt, liefe durch `pnpm build` und
 * oeffnete die gesamte Lagerbuch-Verwaltung fuer jeden Suite-Betreiber (Falle
 * 13). §3.8.2 haelt das mit einer Quelltext-Zusicherung fest.
 */
export function istLagerbuchAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("lagerbuch"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}
```

Die drei tragenden Eigenschaften der Verknüpfung — `adminGroupsFor(mod)` statt `mod.adminGroups`,
„leere Liste gewährt NICHTS", und `SUITE_ACCESS_GROUP_LAGERBUCH` als Boot-Abbruch — stehen
ausgeschrieben in §2.5 und werden hier nicht wiederholt.

`adminGroups: ["lagerbuch-admin"]` in der Registry (§2.3) übernimmt den heutigen Vorgabewert
wortgleich; steht in der produktiven `stack.env` ein abweichendes `OIDC_ADMIN_GROUP`, wird daraus
**eine Zeile** `SUITE_ADMIN_GROUP_LAGERBUCH` mit demselben Wert. ⚠️ **Runbook-Eingabe:** der
produktive Wert von `OIDC_ADMIN_GROUP`.

#### 3.6.2 Braucht das eine Änderung an `core`? Nein

`isModuleAdmin` steigt für den Suite-Admin unbedingt früh mit `true` aus
(`core/groups.ts:103-105`). **Weil lagerbuch die Funktion nicht benutzt, wird der Kurzschluss für
dieses Modul nie erreicht** — Betreiber-Entscheidung 3 ist damit **heute erfüllbar, ohne `core`
anzufassen**. Das suiteweite Entfernen des Kurzschlusses ist eigene `core`-Arbeit, berührt portal,
qr und files und ist **nicht Teil dieser Spec** (§1.5); `core/groups.ts:13-14` schreibt seinen Zweck
aus („Ist überall Admin, damit ein Modul nicht aussperrbar ist"), und fällt er, sperrt ein falsch
gesetztes `SUITE_ADMIN_GROUP_<KEY>` alle aus.

⚠️ **Was daraus für lagerbuch folgt und im Runbook stehen muss:** genau diese Rückfallebene gibt es
für lagerbuch **nicht**. Ein falsch gesetztes `SUITE_ADMIN_GROUP_LAGERBUCH` sperrt jede verwaltende
Person aus, und der einzige Weg zurück ist eine `.env`-Änderung auf dem Server. Der `console.warn`
aus §3.3 ist die Diagnose dafür, die Boot-Prüfung aus §10.5 (Punkt 5) die Vorbeugung.

#### 3.6.3 Ein Fallstrick in `core/auth/guards.ts`

`canAdminModule(moduleKey)` (`core/auth/guards.ts:36-38`) ist die hausübliche Sichtbarkeitsfrage —
und sie ruft `isModuleAdmin`. **In lagerbuch darf sie nicht benutzt werden:** sie zeigte dem
Suite-Admin einen Verwaltungs-Eintrag, dessen Ziel `requireLagerbuchAdmin` mit 404 beantwortet. Das
ist genau der Zustand, den `docs/design/README.md` ausschließt: „führt **kein** Weg dorthin, wo die
aufrufende Person nicht hindarf? … Oberfläche und Riegel müssen **dasselbe Prädikat auf denselben
Viewer** anwenden". Für lagerbuch heißt das: **Navigation und Riegel lesen beide
`istLagerbuchAdmin` auf dem Rückgabewert von `requireLagerbuchAdmin`**, nicht auf einem zweiten
`auth()`-Aufruf — Vorbild `m/feedback/(admin)/layout.tsx:32-58`. Zwei Quellen laufen spätestens im
Verzugsfenster veralteter JWT-Gruppen auseinander.

Dasselbe gilt für `requireModuleAdmin` und `moduleAdminPageOrNotFound` (`guards.ts:20-33`): fertige,
gute Riegel — aber sie tragen die Suite-Admin-Abkürzung und sind für dieses Modul die falschen.

#### 3.6.4 Wie die Gruppenzugehörigkeit in die Server Components kommt — und wie frisch sie ist

```ts
// _lib/zugang.ts — der Backstop
export async function requireLagerbuchAdmin(): Promise<Viewer> {
  requireLagerbuchHost(await headers());          // §2.6 — erst der Host, dann die Person
  const session = await auth();                   // core/auth
  const viewer = viewerAusSession(session);
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel())}`);
  if (!istLagerbuchAdmin(viewer)) {
    meldeFehlendeGruppe(viewer.sub, viewer.groups);   // §3.3
    notFound();
  }
  merkeNutzer(getDb(), viewer);                   // §4.13 — NACH dem Riegel
  return viewer;
}
```

⚠️ **Die Host-Zeile steht hier zusätzlich, nicht ersatzweise:** die Layouts rufen
`requireLagerbuchHost` ohnehin (§2.6), aber `requireLagerbuchAdmin` wird auch aus **Server Actions**
gerufen, und die haben kein Layout über sich. Der doppelte Aufruf kostet einen
Header-Lookup und schließt dieselbe Lücke, die §2.6 für die Helfer-Actions über
`requireHelferSitzung` schließt. **Für die Verwaltung ist das kein Autorisierungsgewinn** (der
Zugriffsriegel ist host-blind und vollständig), sondern die Vermeidung einer zweiten
funktionierenden Herkunft.

Der Weg ist derselbe wie in jedem Suite-Modul: `auth()` liest das Session-JWT,
`core/auth/config.ts:163-165` legt `token.groups` auf `session.user.groups`, und `:171-173` setzt
`session.user.id = token.sub`. Es gibt keinen zweiten Weg und keinen modul-eigenen Provider.

⚠️ **Frische: bis zu eine Stunde Verzug.** Gruppen im JWT sind nur so frisch wie der letzte
erfolgreiche Token-Refresh; der Takt ist die Access-Token-Lebensdauer von Pocket ID (heute etwa eine
Stunde), nicht die Sitzungsdauer von 30 Tagen (`core/auth/config.ts:31-40`, `CLAUDE.md`).
Aufgefrischt wird auf dem Proxy-Pfad und auf `/api/auth/*`, **nicht** bei `auth()` aus einer Server
Component.

**Entschieden: der Verzug wird hingenommen, und hier ist, warum das vertretbar ist.**

- Die Alternative — serverseitige Auflösung aus der Datenbank — braucht eine Objekt-Zugehörigkeit,
  an der man sie auflösen könnte. lagerbuch hat keine: es gibt **eine** Rolle und keine
  Zuordnung von Verwaltenden zu Fahrzeugen oder Lagerorten. Eine modul-eigene Sperrliste zu bauen,
  hieße eine zweite Rechtequelle einzuführen, die niemand pflegt — sie wird **nicht** gebaut.
- **Die Portierung verbessert den Zustand deutlich.** Heute setzt lagerbuch `token.isAdmin` **nur**
  beim Erst-Login (`src/auth.config.ts:104-110`; `account` liegt nur dann an) und definiert keine
  `session.maxAge` — ein Gruppenentzug in Pocket ID wirkt also bis zu 30 Tage lang **gar nicht**. In
  der Suite sinkt das auf rund eine Stunde. Der Verzug ist keine neue Schuld, sondern ein Rest.
- **Der Sofort-Widerruf existiert dort, wo er gebraucht wird:** für Helfer-Zugänge über
  `tokens.aktiv`, und der wirkt nach §3.4.4 ab jetzt bei der nächsten Anfrage, lesend wie
  schreibend. Das ist der Pfad mit den laminierten, verlierbaren Kärtchen.

#### 3.6.5 `session.error` — die Lücke, die anonyme Ansichten verschärfen

`session.error` wird gesetzt (`core/auth/refresh.ts:277,286`, durchgereicht in
`core/auth/config.ts:174-176`), aber **serverseitig von keinem Riegel gelesen**; ausgewertet wird es
allein in der Client-Komponente `components/providers.tsx:64`. Eine Person mit endgültig
gescheitertem Refresh behält ihre alten `groups` bis zum Sitzungsende.

Für lagerbuch ist das schärfer als für die anderen Module, weil das Gate, `/helfer`, `/a` und `/t`
sinnvollerweise **ohne** die Suite-Provider gerendert werden — dort greift der Client-Guard gar
nicht. **Entschieden: hingenommen, ohne Gegenmaßnahme im Modul.** Der Zustand ist selten und
selbstheilend, und ein modul-eigener `session.error`-Riegel wäre die dritte Stelle mit einer eigenen
Meinung über Sitzungsgültigkeit. Der Punkt gehört in dieses Kapitel, damit sein Fehlen eine
Entscheidung ist.

#### 3.6.6 Der Einstieg in die Verwaltung und der `callbackUrl`

**Entschieden: Entscheidung 15, Option (a).** Das Gate auf `/` bleibt der sichtbare Einstieg für
beide Wege; der Verwaltungs-Knopf führt auf das Suite-`/login`.

```ts
// _lib/zugang.ts — Ausschnitt
/**
 * Das Ziel MUSS absolut und auf einen der Suite bekannten Host zeigen. Ein
 * relatives `/m/lagerbuch/verwaltung` (feedbacks Weg,
 * `requireFeedbackAccess.ts:35`) ist bei EINEM Host richtig — hier setzte es die
 * verwaltende Person auf dem PORTAL-Host ab, weil `AUTH_URL` suiteweit derselbe
 * Wert ist (`core/auth/redirect.ts:8-18`), und entwertete den ganzen
 * returnTo-Apparat. `suiteRedirect` prueft das Ziel gegen die Allowlist aus
 * `moduleForHost` (`redirect.ts:52-54`), ein fremder Host landet also nicht.
 *
 * VOR DEM CUTOVER ist der relative Pfad der einzige sichere Wert: ohne
 * SUITE_HOST_LAGERBUCH gibt es keinen absoluten Host, und ein erratener waere
 * schlimmer als keiner — `m/files/_lib/access.ts:115-138` geht denselben Weg und
 * begruendet ihn: ein unbekannter oder protokollfremder Host landet bei
 * `suiteRedirect` STUMM auf dem Portal, ein relativer Pfad geht unveraendert
 * durch (`core/auth/redirect.ts:41`).
 */
function verwaltungsZiel(): string {
  const host = prodHostsFor(getModule("lagerbuch"))[0];
  return host ? `https://${host}/verwaltung` : "/m/lagerbuch/verwaltung";
}
```

Der `adminLandingPfad`-Apparat (`src/lib/auth/cordon.ts:38-48`) **wandert 1:1 mit**, inklusive seiner
Allowlist und seiner Begründung: Auth.js merkt sich die `callbackUrl` in einem Cookie, und dessen
Verlust auf Mobilgeräten war der Anlass. Er fängt cookie-unabhängig ab, dass eine frisch
angemeldete verwaltende Person am Gate stehenbleibt. Der Zweig
`ziel.startsWith("/verwaltung/kein-zugriff")` (`cordon.ts:41`) fällt mit der Seite weg (§3.3, §11.4).

**Er wird aus `_lib/zugang.ts` exportiert (§2.1) und hat genau einen Aufrufer: die Gate-Seite.** Das
ist keine Nebensache, sondern die Bedingung, unter der die Zusage dieses Abschnitts überhaupt
eintritt — im Bestand steht der Aufruf in `src/app/(gate)/page.tsx:16-17`, und ohne ihn wandert eine
Funktion mit, die niemand ruft. Die Aufrufstelle ist in §7.2.4 ausgeschrieben.

⚠️ **Die Weiche dort trägt ein Prädikat, keinen Riegel** (§3.2.1). Im Bestand fragt sie
`session?.user?.isAdmin`; in der Suite lautet sie `istLagerbuchAdmin(await viewerOderNull())` —
**nicht** `requireLagerbuchAdmin()`. Das Gate ist die Seite, auf der „keine Sitzung" der **Regelfall**
ist; ein werfender Riegel schickte jede Helferin nach `/login`, bevor sie das Zahlenfeld je sähe.

⚠️ **Ein Verweis in der Begründung der Allowlist muss umgehängt werden.** Der Kommentar
`cordon.ts:33-35` begründet die Sperre von `/helfer` mit „siehe `helferGateDecision`" — die Funktion
entfällt (§3.1). Die Sache bleibt unverändert wahr: `helfer/layout.tsx` ruft `requireHelferSitzung`,
das eine verwaltende Person ohne Helfer-Sitzung sofort wieder aufs Gate schickt (§3.4.4) — mit
`/helfer` als `returnTo` wäre das eine Endlosschleife. **Der neue Verweis lautet
`requireHelferSitzung` (§3.4.4)**, und er gehört in den portierten Kommentar, nicht nur in diese
Spec.

⚠️ **Eine Aufgabe, die an die Suite geht und nicht an lagerbuch:** `src/auth.config.ts:73-83`
überschreibt die `maxAge` des `authjs.callback-url`-Cookies mit ausgeschriebener Begründung (mobile
Browser und PWAs räumen reine Session-Cookies beim Wechsel in den IdP-Kontext weg).
`core/auth/cookies.ts:33-40` lässt `maxAge` bewusst auf dem Auth.js-Default — genau den Zustand, den
lagerbuch behoben hat, und lagerbuch wird auf Telefonen im Fahrzeug benutzt, also genau in der
Population, in der der Fix entstand. Es gibt **keine** Kollision mit `authCookies()`
(`cookies.ts:33-40` legt dar, dass Auth.js tief merged und nur bei `!== undefined` überschreibt).
**Nicht Teil dieser Spec**, aber ein benannter Posten für die Suite (§15).

### 3.7 Die Nutzerkennung: `users` und `quelle_id`

#### 3.7.1 Was die Kennung heute trägt

Die Journal-Tabellen sind **nachweisfest**: `src/db/quelle.ts:4-11` schreibt aus, dass in der
Datenbank die rohe Kennung stehen bleibt und **nur die Anzeige** aufgelöst wird. Drei
Kennungsräume liegen nebeneinander:

| Feld | Inhalt | Auflösung |
|---|---|---|
| `journal.quelle_id` / `checks.quelle_id` bei `quelle_typ = "oidc"` | OIDC-`sub` | `users.name` → `users.email` → rohe ID (`quelle.ts:13-19,24`) |
| dieselben Felder bei `quelle_typ = "token"` | `tokens.code` | `tokens.label` (`quelle.ts:20,23`) |
| `tokens.created_by` (`schema.ts:145`) | OIDC-`sub` | derselbe Auflöser |

`session.user.id` ist in beiden Systemen der `sub` — lagerbuch holt ihn im `jwt`-Callback aus dem
Profil zurück (`src/auth.config.ts:107`) und legt ihn im `session`-Callback auf `session.user.id`
(`:116`); die Suite tut dasselbe (`core/auth/config.ts:171-173`). **Die Form stimmt also überein;
offen ist allein der Wert** — und den entscheidet §4.13.

#### 3.7.2 Der Upsert bekommt einen neuen Ort

Die Suite hat keinen `events`-Block (Falle 22); `src/auth.ts:9-35` verliert damit seinen
Einhängepunkt. **Entschieden: der Upsert läuft pro Anfrage HINTER dem Riegel**, nach dem
`feedback`-Muster (`requireFeedbackAccess.ts:50-55` ruft `upsertKnownUser`). Die Funktion heißt
`merkeNutzer(db, viewer)` und liegt in `_lib/konto.ts`; ihr Rumpf, die Nicht-Überschreiben-Regel und
der benannte Defektzustand stehen in §4.13. Die Modul-Tabelle `users` bleibt; `core/directory`
ersetzt sie **nicht** — es ist ein Verzeichnisdienst gegen Pocket ID, während `users` die
Nachschlagetabelle für ein append-only-Journal ist und auch dann noch Namen liefern muss, wenn ein
Konto längst gelöscht wurde.

`kontoAusLogin` (`src/lib/auth/konto.ts:19-26`) wird **nicht** portiert: sein einziger Zweck war die
Wahl zwischen `profile.sub` und `user.id` im Auth.js-Event, und dieses Event gibt es nicht mehr.

⚠️ **Der Preis, benannt:** heute entsteht der `users`-Satz beim **Login**. Künftig entsteht er beim
**ersten Aufruf der Verwaltung**. Wer sich anmeldet und lagerbuch nie öffnet, hat keinen Satz — das
ist richtig so. Wer aber Codes erzeugt hat und danach nie wieder die Verwaltung besucht, dessen
`tokens.created_by` bleibt bis zum nächsten Besuch unaufgelöst. In der Praxis fällt das zusammen,
weil man Codes nur **in** der Verwaltung erzeugt.

#### 3.7.3 Der `sub`-Bruch — und warum es hier nichts zu bauen gibt

**Der Zuordnungs- und Bereinigungsweg aus Betreiber-Entscheidung 7 ist vollständig in §4.13
entschieden**, weil er eine Frage des Datenmodells und des Imports ist, keine des Zugangs.
Zusammengefasst, damit dieses Kapitel keine Lücke lässt:

- **Es gibt keine Zuordnungstabelle** `alt_sub → neu_sub` und keine Pflegeseite dafür. Nachgeprüft:
  `quelle_id` wird in keinem Filter- oder Gruppierungspfad benutzt, sondern ausschließlich
  angezeigt (`queries.ts:91-103`, `:352-355`, `:69`, `:119-120`, `:506`).
- **Beide Kennungsräume dürfen als Primärschlüssel derselben `users`-Tabelle nebeneinander leben.**
  Historische Zeilen finden ihre importierte Zeile, neue Zeilen die vom Upsert geschriebene.
- ✅ **Die `sub`-Werte sind gleich — gemessen, nicht mehr angenommen.** Die Discovery der
  Pocket-ID-Instanz liefert `subject_types_supported: ["public"]` (§4.13, Befund 2). Der Weg fällt
  damit **per Identität** zur Nulloperation zusammen: der erste Suite-Login trifft exakt die
  importierte Zeile und aktualisiert sie.
- **Der Import übernimmt `users` gefiltert**, nicht geleert: eine Zeile wandert genau dann, wenn
  ihre `id` in einer der sechs Autorenschaftsspalten vorkommt. Das Prädikat **ist** der Waisenfilter.
- ⚠️ **Was die Messung NICHT wegräumt, ist der Bruch innerhalb von lagerbuch** (Befund 1, §4.13):
  bis `f2b515b` (29.07.2026, fünf Tage vor dem Freeze) trug `users.id` eine Zufalls-UUID pro
  Anmeldung. Wer sich danach nicht mehr angemeldet hat, hat **keine** Zeile unter seinem echten
  `sub` — der Klarname steht nur in der Waisenzeile, die der Filter aussortiert. Der Ausweg ist eine
  **Bereinigung über die Klarnamen**, keine Übersetzungstabelle, und sie gehört Spec 2 (§1.3).

⚠️ **Runbook-Eingabe, weiterhin, obwohl die Client-Frage entschieden ist:** einen `quelle_id`-Wert mit
`quelle_typ='oidc'` aus der produktiven `lagerbuch.db` ziehen und gegen den `sub` halten, den die
laufende Suite für dieselbe Person führt. `subject_types_supported` sagt etwas über die **Ausstellung
heute**; die Stichprobe sagt etwas über die **vorhandenen Zeilen**, und nur die zweite Aussage trägt
den Import. ⚠️ **Der Paritätscheck beantwortet die Frage NICHT:** er beweist den Rundlauf, nicht die
Richtigkeit der Zuordnung — er ist in beiden Fällen grün.

### 3.8 Testaufbau — wer welche Aussage besitzt

Die Zusagen dieses Kapitels sind fast alle von der Sorte, die `pnpm build` und `pnpm typecheck`
strukturell nicht sehen können. Deshalb steht neben jeder Zeile die **Mutation, die grün bliebe**.
Die drei Ebenen und die suiteweiten Randbedingungen stehen in §12; hier stehen nur die Aussagen
dieses Kapitels.

#### 3.8.1 Unit (Vitest)

| Datei | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `_lib/host.test.ts` | `lagerbuch.iuk-ue.de` → wahr, Port und Großschreibung normalisiert; `lagerbuch.localtest.me` **ohne** jede Env-Variable → wahr; fremder Suite-Host → falsch; **auch ohne gesetzte Prod-Hosts ist ein fremder Host falsch** (es gibt keinen Durchlass-Zweig); `requireLagerbuchHost` wirft, `lagerbuchHostOderNull` wirft **nicht** und liefert `"lagerbuch"` | direkter Vergleich gegen `prodHostsFor` statt `moduleForHost` (Dev-Host fällt raus); ein „kein Prod-Host → durchlassen"-Zweig eingebaut (die Sperre schaltet sich vor dem Cutover selbst ab) |
| `_lib/zugang.test.ts` | Mitglied von `adminGroupsFor` → Zugang; **Suite-Admin ohne Lagerbuch-Gruppe → 404**; Eingeloggter ohne Gruppe → 404; **leere `adminGroups` gewähren NICHTS**; keine Sitzung → `redirect` auf `/login` mit **absolutem** `callbackUrl`, wenn ein Prod-Host gesetzt ist, sonst relativ; `SUITE_ADMIN_GROUP_LAGERBUCH` schlägt den Registry-Wert | `istLagerbuchAdmin` auf `isModuleAdmin` umstellen (Suite-Admin kommt rein); `some()` durch die `canAccess`-Verknüpfung ersetzen (leere Liste öffnet alles); `mod.adminGroups` statt `adminGroupsFor` (Env wirkungslos) |
| `_lib/helferSitzung.test.ts` | **Ein Alt-Cookie mit `{tokenId, code, label}` verifiziert weiter** — und liefert dabei ein `laeuftAb`, das dem `exp` dieses Alt-Cookies entspricht; ein Cookie ohne `tokenId` nicht; **ein Cookie ohne `exp` nicht** (die eine Verschärfung aus §3.4.3, und sie darf nur deshalb dort stehen, weil dieser Fall im Bestand nicht vorkommt — `helferSession.ts:14` setzt den Claim unbedingt); fremdes Geheimnis nicht; abgelaufenes `exp` nicht; die Optionen tragen **kein** `domain`, dazu `httpOnly`, `sameSite: "lax"`, `path: "/"` | eine strikte Feldprüfung auf genau `{tokenId}` (jede laufende Feld-Sitzung endet beim Cutover, und **kein anderer Test sieht das**); `domain` aus `AUTH_COOKIE_DOMAIN` mitkopiert |
| `_lib/helferZugang.test.ts` | gesperrter Code blockt den **Lese**pfad, nicht nur den Schreibpfad; `code`/`label` stammen aus der DB-Zeile, nicht aus der Nutzlast; abgelaufene Sitzung auf dem Schreibweg ergibt `{ok:false, grund:"sitzung"}`, gesperrte `grund:"gesperrt"` — **kein** Redirect, kein Wurf | Recheck aus dem Lesepfad entfernen (das Verhalten von heute — grün in jedem Test, der nur schreibt); die beiden Gründe zusammenlegen (dann bietet §7.4.4 das Inline-Feld im falschen Fall an) |
| `_lib/absender.test.ts` | `cf-connecting-ip` gewinnt und trägt den `cf:`-Präfix; **ein gesetzter `x-forwarded-for` wird in KEINER Richtung gelesen** (weder erster noch letzter Eintrag), auch nicht neben `cf-connecting-ip`; ohne beide Köpfe der konstante Wert `"direkt"`; der Präfix trennt die Namensräume | `x-forwarded-for` als Rückfall einbauen (sieht wie eine Verbesserung aus und ist der ganze Fehler). **Dies ist die Erbin von `lagerbuch/src/lib/auth/rateLimit.test.ts:33-38`** — deren ersatzloses Löschen ist laut Analyse die einzige ungesicherte Stelle des Umbaus |
| `_lib/gateSchranke.test.ts` | **eine erfolgreiche Einlösung verbraucht kein Budget** (100 Erfolge in Folge schließen das Gate nicht); der 6. Fehlversuch desselben Absenders wird abgewiesen; ein gesperrter Absender verbraucht das modulweite Budget **nicht** (Kurzschluss); der modulweite Stundendeckel greift auch bei jedem Versuch von einem anderen Absenderschlüssel; nach Fensterende geht es weiter; **die Sperrprüfung erfolgt ohne Datenbankzugriff** | Verbrauch vor die Codeprüfung ziehen (= heutiges Verhalten, `(gate)/actions.ts:19`); den Deckel nur die Fehlermeldung umschalten lassen, statt die Codeprüfung zu verhindern |
| `_lib/code.test.ts` | `123456`, `123-456`, ` 123 - 456 ` ergeben denselben kanonischen Wert `123-456`; ein fremdes Zeichen führt nicht zu einer stillen Verstümmelung | die Bindestrich-Ergänzung entfernen — liefert `{ok:false}`, also genau das, was ein falscher Code liefern soll, und hat damit **keine Fehlerform** |

`_lib/boot.test.ts` und `_lib/grenzen.test.ts` gehören §10.5/§12.2, `_db/quelle.test.ts` gehört
§4.16.

#### 3.8.2 Quelltext-Zusicherungen — die ehrliche Ebene für „diese Bauform ist eingehalten"

Sie belegen nicht, dass etwas **wirkt**, sondern dass eine Bauform **eingehalten** ist. Genau dafür
sind sie hier die richtige Ebene, und die Suite benutzt sie an vergleichbaren Stellen schon
(`src/core/shell/icons.test.ts` riegelt Falle 7 repo-weit ab; die files-Spec benutzt dieselbe Form
für ihren `throw`-Scan).

| Zusicherung | Warum sie kein Laufzeittest sein kann |
|---|---|
| **Kein `isAdmin` in `src/app/m/lagerbuch/`** — kein Treffer auf `user\.isAdmin` oder `session\.user\.isAdmin` | Ein 1:1-Port von `src/lib/auth/cordon.ts:14-20` ist typkorrekt (beide Felder sind `boolean`), läuft durch `pnpm build`, und **beide Dev-Logins setzen `isAdmin = true`** — die E2E blieben grün, während die gesamte Verwaltung für jeden Suite-Betreiber offen stünde (Falle 13) |
| **Kein `isModuleAdmin`, kein `requireModuleAdmin`, kein `moduleAdminPageOrNotFound`, kein `canAdminModule` in `src/app/m/lagerbuch/`** | Die vier Funktionen sind fertig, gut und die falschen für dieses Modul (§3.6.3). Ein Import sieht wie Wiederverwendung aus |
| **Kein `x-forwarded-for` in `src/app/m/lagerbuch/`** | §3.5.2. Die Zeile wieder einzubauen sieht wie eine Verbesserung aus |
| **Kein `domain` in `_lib/helferSitzung.ts`** | Die naheliegende Vorlage heißt `core/auth/cookies.ts` und setzt es; Playwright fährt gegen **einen** Host, wo ein domain-weites Cookie sich exakt wie ein host-only verhält (Falle 19) |
| **Kein `getModuleDb("lagerbuch"` im gesamten Repo** | §5.13.2 — eine zweite Verbindung ohne `lb_falte`. Der Fehler wäre ein Laufzeitfehler auf genau einem Codepfad |
| **Kein `usePathname` unter `src/app/m/lagerbuch/`** | §7.8.2 — ein DOM-Test müsste `next/navigation` mocken und bewiese damit nichts (`SuiteNav.test.tsx:263-266`) |
| **Kein `requireLagerbuchAdmin` und kein `requireHelferSitzung` in den drei Weichen-Dateien** — `page.tsx` (Gate), `a/[artikelId]/page.tsx`, `g/[code]/page.tsx`; dafür in jeder von ihnen `requireLagerbuchHost` als **erste** Anweisung | §3.2.1, Regel „Riegel in Layouts und Actions, Prädikat in Weichen". Ein Riegel in einer dieser drei Dateien schickt **jeden anonymen Scan nach `/login`** statt aufs Gate (§11.5, Zustand 18) — der Ausfall, gegen den `requiresAuth: false` gebaut ist. Der Fehler ist typkorrekt, lint-sauber und für `pnpm build` unsichtbar; ein E2E fände ihn nur mit einem Abruf **ohne** Cookie, und genau der fehlt heute. Der Scan ist die billigste Absicherung, weil die Regel eine Bauform ist und keine Laufzeitaussage |
| **Jede exportierte Funktion in `_actions/*.ts` ruft `requireLagerbuchAdmin` oder `requireHelferSchreibend` — oder steht auf einer benannten Ausnahmeliste mit GENAU DREI Einträgen** | **Dies ist die eigentliche Zusage dieses Kapitels**, nicht der Cordon (§3.2.1, Punkt 3). Eine fehlende Guard-Zeile in einer neu hinzugefügten Action ist typkorrekt, lint-sauber und sieht wie ein Erfolg aus; **es gibt keinen Test, der eine Action ohne Sitzung aufruft**. Ohne diesen Scan bleibt „44 von 44" eine Absichtserklärung. Der Scan zählt zugleich die Ausnahmen — wächst die Liste, ist das ein roter Test und keine Zeile im Diff |

⚠️ **Wie der Scan zählt, steht in §2.1 a und gehört zwingend dazu** — die Abbildung Alt→Neu dort ist
seine Sollliste. Vier Auflagen daraus, ohne die er falsche Zahlen liefert: **`export type` und
`export interface` werden verworfen** (`detail.ts` exportiert drei Typen neben einer Action); gezählt
wird **je Datei je Deklaration, nie über ein `Set` der Namen** (`geraetSpeichern`, `setGeraetAktiv`
und `geraetZuBarcode` stehen in `bz.ts` **und** in `geraete.ts` — ein `Set` ergäbe 41 statt 44); die
Sollzahl ist **47 Actions, davon 44 bewacht** und drei auf der Liste unten; und `guards.test.ts`
überspringt **sich selbst**.

**Die Ausnahmeliste hat genau drei Einträge, und jeder ist begründet:**

| Action | Datei | Warum sie öffentlich sein muss |
|---|---|---|
| `einloesenAmGate` | `_actions/gate.ts` | sie *erzeugt* die Sitzung; ein Riegel davor wäre zirkulär. Sie trägt stattdessen `requireLagerbuchHost` und die Gate-Schranke (§2.6, §3.5.3) |
| `erneuereSitzung` | `_actions/sitzung.ts` | dieselbe Fläche wie das Gate, nur inline im Check (§7.4.4) — dieselben drei Riegel |
| `beenden` | `_actions/sitzung.ts` | löscht ausschließlich das eigene Cookie (`helfer/actions.ts:7`); ein Riegel davor machte das Abmelden einer abgelaufenen Sitzung unmöglich |

#### 3.8.3 Playwright — was nur ein echter Abruf zeigt

| Fall | Zusage |
|---|---|
| `/t/<code>` auf `lagerbuch.localtest.me` mit gültigem Code | 303 auf das Code-Ziel, `Set-Cookie: helfer_session` **ohne** `Domain=`, danach `/helfer` erreichbar |
| `/m/lagerbuch/t/<code>` auf einem **fremden** Suite-Host | **404 vor jeder Wirkung** — und in der Datenbank ist `tokens.last_used_at` danach **unverändert** `NULL`. Das ist die Zeile, die Falle 61 bezahlt |
| `/m/lagerbuch/verwaltung` auf einem fremden Suite-Host | 404 |
| Sitzung als Suite-Admin **ohne** Lagerbuch-Gruppe, dann `/verwaltung` | 404 (die Suite-404-Seite, nicht 403), und **kein** Verwaltungs-Eintrag in der Navigation |
| Code sperren, während eine Helfer-Sitzung läuft, dann `/helfer` neu laden | Umleitung **über `/abmelden`** ans Gate mit benannter Meldung; die Antwort von `/abmelden` trägt ein `Set-Cookie: helfer_session=` mit `Max-Age=0` und **ohne** `Domain=`, und ein zweiter Aufruf von `/helfer` landet danach ohne Umweg am Gate. Die Kette (zwei 303) wird mit `page.waitForURL` und dem Antwortprotokoll geprüft, nicht nur die Endadresse — sonst bliebe eine ungelöschte Cookie-Zeile grün |
| Gesperrter Code an einer schreibenden Action | **deutsche Meldung, kein Absturz** — ersetzt `lagerbuch/e2e/helfer-flow.spec.ts:56`, das wörtlich `/server-side exception/` verlangt (§12.5) |
| Gate mit gesperrtem Code | benannte Meldung am Feld — **nicht** die heutige stumme Landung (Falle 60, §3.9) |

⚠️ **Prüflücke, benannt statt übersehen:** Playwright fährt gegen genau **einen** `baseURL`. Der
Fall „fremder Suite-Host" ist nur darstellbar, wenn die E2E-Konfiguration einen zweiten Host
mitführt (etwa `feedback.localtest.me` auf demselben Server) und der Test dorthin absolut
navigiert. Ohne diese Ergänzung sind die beiden Host-Zeilen oben nicht durchführbar und der
Host-Riegel bleibt unbewiesen — dann gilt §3.8.1 Zeile 1 als einzige Absicherung, und das ist
ausdrücklich zu wenig für die Zeile mit der Datenwirkung.

### 3.9 Das Gate liest seine Fehlermeldungen — Falle 60

`src/app/t/[code]/route.ts:21` hängt heute `?err=rate` bzw. `?err=code` an die Gate-URL. Ein `grep`
auf den String über `src/` liefert genau **einen** Treffer, und das ist die schreibende Zeile;
`src/app/(gate)/page.tsx:10` destrukturiert aus `searchParams` ausschließlich `returnTo`.
Wer heute ein Etikett scannt, dessen Code gesperrt oder rate-limitiert ist, landet **wortlos** auf
dem Gate und sieht dasselbe Bild wie bei einem ganz normalen Aufruf.

**Das ist ein Mangel des Bestands, kein Portierungsrisiko** — aber es ist eine Falle für die
Portierung selbst: `?err=` sieht in `route.ts` nach einer funktionierenden Nutzerauskunft aus, und
ein Port, der die Zeile mitnimmt und abhakt, übernimmt eine Sackgasse als Feature. Die Gate-Seite
wird für den Neubau ohnehin angefasst. **Entschieden: der Parameter heißt `grund`, ist ein
geschlossener Satz, und das Gate liest ihn.** Der Name wechselt, weil der Wertesatz wächst — `err`
kannte zwei Werte, `grund` kennt vier; ein gespeicherter Alt-Link mit `?err=` ist danach
wirkungslos, aber nicht kaputt (unbekannte Parameter werden ignoriert).

| `?grund=` | Anlass | Text am Gate |
|---|---|---|
| `code` | Code unbekannt oder gesperrt (`redeemToken` → `{ok:false}`) | „Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung." |
| `gesperrt` | Sitzung lief, Code wurde inzwischen gesperrt (§3.4.4) | „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." |
| `abgelaufen` | Helfer-Sitzung abgelaufen | „Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut." |
| `zuviele` | Fehlerbudget erschöpft (§3.5.3) | „Zu viele Fehlversuche. Bitte in *n* Sekunden erneut versuchen." — *n* ist der Rückgabewert von `gateGesperrt(absenderAus(await headers()))`, **den die Gate-Seite selbst liest** (§7.2.4); über die URL wandert nur der Grund. Kommt `null` zurück (die Sperre ist inzwischen abgelaufen), gilt „Bitte in einer Minute erneut versuchen." |
| unbekannter Wert | — | wird ignoriert, das Gate rendert normal |

Der Wert wird gegen die Liste geprüft und nie in die Seite durchgereicht — ein `searchParams`-Wert
ist Nutzereingabe. **Diese fünf Zeilen sind die einzige Stelle, an der die Gate-Texte stehen**;
§7.2.4 und §11.5 verweisen darauf. Damit „eine Stelle" mehr ist als eine Absichtserklärung, tragen
sie einen Namen:

```ts
// src/app/m/lagerbuch/_lib/gateTexte.ts        (KEIN "use client")
/** Der geschlossene Satz aus der Tabelle oben. NICHT zu verwechseln mit
 *  `HelferGrund` aus `_lib/actionTypen.ts` (§7.3): der beschreibt das Ergebnis
 *  einer Helfer-ACTION am Formular, dieser den Anlass einer Landung AM GATE.
 *  Sie ueberschneiden sich in genau einem Wort (`gesperrt`) und in keinem Weg —
 *  zusammenlegen hiesse, den Text „deine Eingaben bleiben stehen" auf eine Seite
 *  zu schreiben, auf der nichts eingegeben wurde. */
export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";
export function istGateGrund(roh: string | null): roh is GateGrund;

/** Der anzuzeigende Satz — `null`, wenn `roh` nicht im Satz steht oder fehlt
 *  (das Gate rendert dann normal). `sperrSekunden` stammt aus `gateGesperrt()`
 *  und wirkt nur auf `zuviele`; `null` waehlt dort den Satz ohne Zahl. */
export function gateMeldung(roh: string | null | undefined,
                            sperrSekunden: number | null): string | null;
```

Beide Leser dieser Datei stehen fest: die Gate-Seite (§7.2.4) und `einloesenAmGate`
(`_actions/gate.ts`), das seine Sekundenzahl unmittelbar aus dem eigenen `gateGesperrt`-Aufruf hat
und deshalb keinen Umweg über die URL nimmt. `istGateGrund` hat einen dritten: der Route Handler
`/abmelden` (§3.4.4) reicht nur Werte aus diesem Satz weiter.

### 3.10 Verworfene Alternativen

Sie stehen gesammelt in §13; hier nur die, die ausschließlich dieses Kapitel betreffen und dort
sonst ohne Zusammenhang stünden — der Rest ist in §13 aufgenommen.

| Verworfen | Warum |
|---|---|
| **Sonderzweig für lagerbuch in `core/routing.ts`** (Entscheidung 10b) | Wäre der einzige Weg, den Riegel **vor** das Rendern zu bekommen — verstößt aber gegen „nur was ein zweites, heute belegbares Modul braucht". Der Preis ist in §3.2.1 benannt und bezahlt |
| **Zwei Hosts wie `files`** (Entscheidung 10c) | Kostet eine zweite Domain und macht jeden erzeugten Link host-abhängig. `files` hat zwei **disjunkte Pfadräume** und zwei Publika; lagerbuch hat einen Pfadraum, in dem `/a/<id>` für beide Rollen dieselbe Adresse ist. Außerdem setzte (c) die Host-Sperre (d) voraus, sonst wäre der Verwaltungs-Host über `/m/lagerbuch/verwaltung/*` von jedem anderen Suite-Host offen |
| **`tokens.scope_lagerort_id` zum Riegel machen** | Wäre eine echte Verhaltensänderung — Codes, die heute im ganzen Bestand arbeiten, könnten danach nur noch ihr Fahrzeug bedienen. Das muss der Betreiber wollen und zur physischen Verteilung der Etiketten passen; die Frage ist offen und **kein Auth-Thema dieser Spec**. Bis dahin gilt: der Helfer-Token trägt **keine** Zugriffsgrenze (§3.4.5). ⚠️ Die **Spalte** bleibt trotzdem im Schema (§4.12) |
| **Route Handler, der beim Cutover die ALT-Cookies löscht** | Löste ein Problem, das es nur in einem der beiden Cutover-Zweige gibt, und dort löst es eine Zeile im Runbook (§3.11). ⚠️ **Nicht zu verwechseln mit `/abmelden`** (§3.4.4): der ist kein Cutover-Werkzeug, sondern der laufende Betriebsweg für ein totes Cookie — und er existiert, weil eine Server Component keins löschen kann, nicht weil ein Cutover-Zweig es nötig machte |

### 3.11 Was dieses Kapitel dem Runbook schuldet

| Eingabe | Warum sie nicht im Repo steht |
|---|---|
| ⚠️ **Ist der Alt-Host identisch mit `SUITE_HOST_LAGERBUCH` (`lagerbuch.iuk-ue.de`)?** | `lagerbuch/compose.yaml:11` liest `${APP_BASE_URL}` aus der gitignorierten `stack.env`. **Diese eine Angabe entscheidet zwei Dinge zugleich:** ob Betreiber-Entscheidung 4 für die Helfer-Sitzungen überhaupt trägt (host-only Cookie — bei abweichendem Host überlebt keine Sitzung, gleich welches Geheimnis, §3.4.2), und ob die Kollision unten eintritt. Die Entscheidungen dieses Kapitels ändern sich in keinem der beiden Zweige, nur ihr Nutzen |
| ⚠️ **Abmeldung der Verwaltenden auf dem Alt-Stack VOR dem Freeze** | Nur nötig, wenn die Hosts identisch sind. Die Alt-Anwendung setzte ihr Auth.js-Session-Cookie **host-only** auf demselben Namen, den die Suite mit `Domain=.iuk-ue.de` führt; danach stehen zwei gleichnamige Cookies nebeneinander. **Symptom:** die Anmeldung scheint nicht zu greifen, und ein erneuter Login behebt es **nicht**. **Abhilfe:** Website-Daten für diesen Host löschen. **Vorbeugung:** einmal auf dem Alt-Stack abmelden (der Knopf existiert, `src/app/verwaltung/(admin)/layout.tsx:25`) — das löscht genau die Auth.js-Cookies. ⚠️ **Nicht zu „Website-Daten löschen" ausweiten:** das zerstörte genau die `helfer_session`-Cookies, die der Betreiber erhalten wollte. Die Klasse ist belegt, nicht vermutet — `core/auth/cookies.ts:5-31` schreibt den produktiv erlittenen Vorfall aus |
| ⚠️ **`HELFER_SESSION_SECRET` aus der produktiven `stack.env`** — als `LAGERBUCH_HELFER_SITZUNG_SECRET` in die Suite-`.env`, über `env_file` (§10.6) | Betreiber-Entscheidung 4. Und in den **Abbau**-Teil: das Geheimnis lebt danach an zwei Stellen auf demselben Server; wird der Alt-Stack abgebaut, ohne die alte Datei zu löschen, bleibt ein gültiges Sitzungsgeheimnis in einer Datei liegen, die niemand mehr pflegt |
| ⚠️ **`AUTH_SECRET` der Suite bleibt unverändert** | Guardrail, §3.4.1 und §10.6. Der Fehlerfall ist: alle Nutzer von portal, qr, feedback und files auf einen Schlag abgemeldet — für einen Nutzen, den es nicht gibt |
| ⚠️ **Produktiver Wert von `OIDC_ADMIN_GROUP`** → `SUITE_ADMIN_GROUP_LAGERBUCH` | `lagerbuch/compose.yaml:23` liest ihn aus der `stack.env`; im Repo steht nur der Default `lagerbuch-admin`. Ein falscher Wert sperrt **alle** Verwaltenden aus, und es gibt für dieses Modul bewusst keine Suite-Admin-Rückfallebene (§3.6.2) |
| ⚠️ **`select count(*) from tokens where aktiv = 1`** | Bestimmt, ob `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE = 300` trägt (§3.5.3) |
| ⚠️ **Den direkten Weg an Cloudflare vorbei schließen** und gegenprüfen | §3.5.2. Solange er offen ist, ist der Absenderschlüssel fälschbar und nur die beiden modulweiten Zähler tragen |
| ⚠️ **Ein `quelle_id` aus der produktiven `lagerbuch.db` gegen den Suite-`sub` derselben Person** | ✅ Die **Client**-Frage ist entschieden (`subject_types_supported: ["public"]`, §4.13). Die Stichprobe bleibt trotzdem: sie prüft die **vorhandenen Zeilen**, nicht die Ausstellung von heute. Billig, und sollte vor dem Cutover laufen |
| ⚠️ **Wie viele `users`-Zeilen auf eine Zufalls-UUID geschlüsselt sind, und für wie viele Personen es KEINE Zeile unter ihrem echten `sub` gibt** | Der Umfang der Bereinigung aus §4.13, Befund 1 (`f2b515b` am 29.07.2026, Freeze fünf Tage später). Zwei `SELECT count(*)` — der erste gegen das Filterprädikat aus §4.13 (ii), der zweite gegen seine Negation, auf `buchungen.quelle_id` bezogen. Ohne die Zahlen ist der Posten weder planbar noch abzuschätzen |
| **`TZ=Europe/Berlin`** | Die Spec rechnet mit diesem Wert. Das Setzen selbst ist ein suiteweiter Schritt mit eigener Prüfung gegen vier laufende Module und **nicht Teil dieser Spec** |

### 3.12 Was ausdrücklich NICHT Teil dieser Spec ist

Damit die Abwesenheit dieser Punkte nicht als Versehen gelesen wird:

- **Das Setzen von `TZ`** — suiteweiter Eingriff in den Betrieb von vier Modulen (§1.5).
- **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts:103-105`** — eigene
  `core`-Entscheidung; für lagerbuch nicht nötig, weil die Funktion nicht benutzt wird (§3.6.2).
- **Die suiteweite Frage, ob `/m/*` gegatet wird** — eigene Suite-Spec; für lagerbuch genügt der
  modulinterne Host-Riegel (§3.2.4).
- **Jede Änderung an `core/ratelimit.ts`** — begründet in §3.5.4.
- **Die `callback-url`-`maxAge` in `core/auth/cookies.ts`** — benannter Suite-Posten, §3.6.6, §15.
---

## 4. Datenmodell

Sechzehn Tabellen, ein append-only Journal, fünf Zeitdarstellungen und drei Textdatumsformate. Dieses
Kapitel schreibt das **Zielschema** aus — Tabelle für Tabelle, Spalte für Spalte, mit Einheit,
Constraint und Index. Es ist ein 1:1-Port; genau deshalb steht er hier vollständig da. Ein 1:1-Port ist
eine **Behauptung**, und eine Behauptung, die niemand nachlesen kann, ist nicht prüfbar.

Nachgezählt am eingefrorenen Stand `ca04eb1`: `grep -c "sqliteTable(" src/db/schema.ts` = **16**
(nicht 17, wie der Auftrag der Analyse annahm), **16 Zeitspalten**, in §4.5 einzeln aufgezählt
(nicht 13, wie die Analyse in Abschnitt 2.1 beiläufig schreibt — die Zahl ist hier nachgezählt, nicht
übernommen; `grep -c` allein taugt als Beleg nicht, es zählt **Zeilen**, nicht Vorkommen). Sieben
Migrationen unter `drizzle/0000` … `0006`.

---

### 4.1 Grundsätze — was „1:1" hier heißt, und die vier Stellen, an denen es das nicht heißt

**Das tragende Prinzip ist rekonstruktiv und bleibt es.** `chargen` trägt **keine** Menge; jeder
Bestand ist `SUM(buchungen.menge)`, lagerort-gescoped
(`src/lib/domain/bestand.ts` via `src/db/abbuchung.ts:36-41`, `implementierungsplan.md:87/:198`). Es
gibt **keinen zweiten Wahrheitsspeicher** — keine materialisierte Bestandsspalte, keine
Bestandstabelle, kein Cache mit Persistenz. Das ist Entscheidung 7 Option (c) ausdrücklich verworfen;
umgesetzt wird die **Empfehlung (b)**: rekonstruktiv bleiben, aber die N+1-Muster aus
`src/db/queries.ts:35-56` durch je **eine** aggregierende SQL-Abfrage ersetzen (§5.2.4). Das ist
verhaltensneutral und ein Query-Thema, kein Modell-Thema — es kostet in diesem Kapitel nur die vier
Indizes aus §4.14.

**Übernommen wird das Schema in Spaltennamen, Typen, Nullbarkeit, Defaults und Indexnamen wörtlich.**
Vier benannte Abweichungen (S1–S4), jede unten begründet:

| # | Abweichung | Wirkung auf die Datenbank | Wirkung auf den Import |
|---|---|---|---|
| S1 | `checks.quelle_typ` bekommt den Drizzle-Enum `["token","oidc","system"]` | **keine** — SQLite-`text({enum})` erzeugt keinen CHECK; nachprüfbar an `drizzle/0000_brief_zodiak.sql:20`, wo `buchungen.quelle_typ` *mit* Enum trotzdem als nacktes `text NOT NULL` steht | keine |
| S2 | Zwei zusätzliche Trigger auf `bz_kontrollen` (§4.4) — und **ausdrücklich keine** auf `o2_messungen` | `UPDATE`/`DELETE` auf `bz_kontrollen` brechen ab | keiner — der Import fügt nur ein |
| S3 | **Vier** zusätzliche Indizes (§4.14) | Schreibkosten, kein Verhalten | keiner |
| S4 | Die Handlager-Zeile wird eine Migrationszeile statt eines Boot-Schritts (§4.3) | eine Zeile in `lagerorte` existiert nach der Migration | `INSERT OR IGNORE` — kollidiert nicht mit der importierten Altzeile |

**Was ausdrücklich NICHT abweicht** — und wo der naheliegende Aufräumreflex Daten kostet:

- **Kein `UNIQUE` auf `(artikel_id, chargen_nr, verfall)`** (§4.8). ⚠️ Die FEFO-Determinismus-Frage,
  die dafür sprechen könnte, ist in §5.3.1 **anders** gelöst — über einen Sortier-Tiebreaker, der
  keine Migration braucht und keine Produktionsdaten voraussetzt.
- **Kein `CHECK` auf die drei Monatsfelder und die zwei Tagesfelder** (§4.6).
- **Keine `NOT NULL`-Verschärfung**, keine Spalte gestrichen — auch nicht die belegt tote
  `tokens.scope_lagerort_id` (§4.12).
- **Kein Feld `gezaehlt` im Check-Ergebnis.** Entscheidung 1 fällt auf **(a)**: der Zählschritt
  belegt weiter mit `ist ?? soll` vor und sendet **alle** Positionen (`CheckFlow.tsx:94-97`, `:146`).
  Die Konvention ist dokumentiert und testverankert (`src/actions/check.test.ts:63-71` behauptet
  ausdrücklich die „+4 Eröffnungs-Korrektur"); wer sie ändert, ändert eine bewiesene Invariante in
  einem Journal, das keine Korrektur durch Löschen kennt. Damit gibt es **keine Formatversion 3** in
  `checks.ergebnis` (§4.10).

**Die vier Pragmas sind identisch, das ist keine Portierungsaufgabe.** `core/db/index.ts:18-21` setzt
`journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL` — dieselben
vier wie `lagerbuch/src/db/index.ts:17-20` und dieselben, die `implementierungsplan.md:171`
festschreibt. **`foreign_keys` ist eine Verbindungseigenschaft und in SQLite standardmäßig AUS**;
jeder Testaufbau, der die Zusagen dieses Kapitels prüfen will, muss das Pragma selbst setzen, sonst
sind alle FK-Behauptungen grün, ohne zu gelten (Vorbild: `m/files/_db/migrations.test.ts:27-28`).
⚠️ **Der modul-eigene Opener aus §5.13.2 benutzt genau diese Funktion** (`openModuleDatabase`) und
erbt die vier Pragmas damit unverändert; er ergänzt allein die SQLite-Funktion `lb_falte`.

**Die Datenbankdatei heißt `lagerbuch.db` — in beiden Welten.** `moduleDbPath("lagerbuch")` liefert
`${DATA_DIR}/lagerbuch.db` (`core/db/index.ts:8-10`); die Alt-Anwendung fährt
`DATABASE_PATH=/data/lagerbuch.db` (`lagerbuch/compose.yaml:17`). Bei `DATA_DIR=/data` ist der Zielpfad
byte-gleich mit dem Quellpfad. ⚠️ **Runbook-Eingabe:** der produktiv gesetzte `DATA_DIR` der Suite —
er steht in der gitignorierten `env_file` (`iuk-suite/compose.yaml:16-19`), nicht im Repo.

---

### 4.2 Das Dreieck — drei Einträge, sonst läuft es lokal und bricht im Container

Die drei Einträge und die fünf still scheiternden Nebeneinträge stehen vollständig in §2.2. Hier
stehen nur die Dateien, die dieses Kapitel liefert:

```
src/app/m/lagerbuch/_db/
  schema.ts                       # die 16 Tabellen (§4.8 ff.)
  client.ts                       # getDb() — MODUL-EIGENER Opener mit lb_falte (§5.13.2)
  drizzle.config.ts               # out: "./src/app/m/lagerbuch/_db/migrations"
  migrations.test.ts              # der Beweis, dass §4 stimmt (§4.16)
  append-only.test.ts             # der Beweis, dass die Trigger da sind (§4.16)
  migrations/
    meta/_journal.json
    0000_<generiert>.sql          # 16 Tabellen + alle Indizes
    0001_append_only.sql          # 2 Trigger auf buchungen — WÖRTLICH aus der Alt-App
    0002_bz_kontrollen_append_only.sql
    0003_handlager.sql
```

`drizzle.config.ts` folgt `m/files/_db/` Zeile für Zeile; die einzige Änderung ist der Modulschlüssel
`"lagerbuch"` und die drei Pfade. `client.ts` weicht bewusst ab (§5.13.2). `_db` ist ein Private
Folder (`_`-Präfix), liegt also außerhalb des Routings.

**Ohne Schema-Import und ohne Eintrag in `seedAllModules()`** — die Begründung steht in §2.2, Punkt 6,
und sie hat für lagerbuch einen zweiten, härteren Teil als für `files`: `seedAllModules()` ist die
einzige `core`-Stelle, die `getModuleDb(<key>, schema)` ruft, und eine solche Verbindung kennte
`lb_falte` nicht.

---

### 4.3 Regenerieren statt kopieren — und die Beweispflicht, die daran hängt

**Entscheidung 4, Teil (i): das Migrationsverzeichnis wird NEU generiert**, als ein gequetschtes
`0000` aus `_db/schema.ts`, plus drei handgeschriebene Nachträge. Damit folgt lagerbuch dem Hausstil
aller vier portierten Module. Der Preis ist der, den Falle 1 benennt: **`drizzle-kit generate` erzeugt
keine Trigger** — `schema.ts` deklariert sie nirgends (Drizzle kennt für SQLite kein
Trigger-Primitiv), und ein `grep -l TRIGGER drizzle/` liefert in der Alt-App genau eine Datei,
`0001_append_only.sql`. Ein naiv regeneriertes Verzeichnis ergibt eine Datenbank, die sich **exakt
gleich verhält, bis irgendwer `UPDATE buchungen` fährt**. Deshalb, verbindlich:

- **`0001_append_only.sql` ist eine wörtliche Kopie** von `lagerbuch/drizzle/0001_append_only.sql`
  (11 Zeilen, zwei `BEFORE`-Trigger, `--> statement-breakpoint` dazwischen). Nicht neu formuliert,
  nicht umbenannt: die Triggernamen `buchungen_no_update` und `buchungen_no_delete` und der
  Meldungstext `journal ist append-only` bleiben, weil `src/db/append-only.test.ts:29,36` auf
  `/append-only/` prüft und der Text die einzige Erklärung ist, die ein Betreiber im Log sieht.
- **Handgeschriebene Migrationen brauchen einen selbst gepflegten Eintrag in `meta/_journal.json`**
  (`idx`, `version: "6"`, `when` als ms-Zeitstempel, `tag`, `breakpoints: true`) — die Alt-App macht
  genau das für `0001` (`drizzle/meta/_journal.json`, Eintrag `idx: 1`, `when: 1783691572392`). Der
  Migrator vergleicht ausschließlich `created_at` der letzten `__drizzle_migrations`-Zeile gegen
  `folderMillis` und liest den gespeicherten **Hash nie zurück** (1:1-Pflicht 9). Zwei Folgen, die in
  jedes Review dieses Verzeichnisses gehören: eine *inhaltlich geänderte* `.sql` bei gleichbleibendem
  `when` bleibt **still** (Produktion und frische Dev-DB divergieren, beide grün), und ein
  nachträglich eingeschobener kleinerer `when` wird nie ausgeführt.
- **`0002_bz_kontrollen_append_only.sql`** trägt die zwei neuen Trigger (§4.4) — bewusst in einer
  **eigenen** Datei, damit die Behauptung „0001 ist wörtlich die Alt-Datei" wörtlich prüfbar bleibt.
- **`0003_handlager.sql`** ist Entscheidung 25, Option (a):

  ```sql
  INSERT OR IGNORE INTO lagerorte (id, name, typ, kennung, aktiv, template_id)
  VALUES ('handlager', 'Handlager', 'lager', NULL, 1, NULL);
  ```

  Begründung gegen die beiden anderen Optionen: die Handlager-Zeile ist eine **fachliche Konstante**
  mit 75 Fundstellen unter `src/` (1:1-Pflicht 10), kein Seed. Als Boot-Schritt (Option b) liefe sie
  außerhalb der Versionierung; als Boot-Assert (Option c) machte eine fehlende Zeile aus einem
  Datenproblem einen **Totalausfall der ganzen Suite** — `migrateAllModules()` läuft für alle Module
  in einer Schleife (`bootstrap.ts:55-59`). `INSERT OR IGNORE` ist idempotent und kollidiert nicht mit
  der Altzeile, die der Import mitbringt: die produktive `lagerorte`-Tabelle trägt `'handlager'` seit
  dem ersten Boot, weil `ensureHandlager` selbst mit `onConflictDoNothing` arbeitet
  (`src/db/seed-handlager.ts:6-11`). Das Idiom `INSERT OR IGNORE` ist in **beiden** Repos etabliert.

**Die Beweispflicht, die das Regenerieren erzeugt.** Wer kopiert, hat das Alt-Schema per Definition;
wer regeneriert, behauptet es. Zwei Prüfungen lösen die Behauptung ein — die erste dauerhaft, die
zweite einmalig:

1. **`_db/migrations.test.ts`** (dauerhaft, §4.16): baut eine temporäre **Datei**-DB, setzt
   `foreign_keys = ON`, spielt `migrate()` gegen den Ordner ab und prüft je Tabelle Spaltennamen,
   Typen, `notnull`, `dflt_value` und die Indexliste gegen eine im Test ausgeschriebene Erwartung —
   das Muster steht fertig in `m/files/_db/migrations.test.ts:1-40`.
2. **Ein einmaliger Schema-Diff gegen die Alt-App** (Bau-Task, kein Dauertest). Reproduzierbar:

   ```bash
   # Quelle (Alt-Repo, eingefrorener Stand ca04eb1)
   cd lagerbuch && rm -f /tmp/alt.db && pnpm exec tsx -e \
     'import D from "better-sqlite3";import {drizzle} from "drizzle-orm/better-sqlite3";
      import {migrate} from "drizzle-orm/better-sqlite3/migrator";
      const s=new D("/tmp/alt.db");migrate(drizzle(s),{migrationsFolder:"./drizzle"});'
   sqlite3 /tmp/alt.db \
     "select type,name,sql from sqlite_master where name not like 'sqlite_%' and name not like '__drizzle%' order by type,name;" > /tmp/alt.schema
   # Ziel analog gegen src/app/m/lagerbuch/_db/migrations, dann:
   diff /tmp/alt.schema /tmp/neu.schema
   ```

   **Erwarteter Diff, abschließend:** die zwei zusätzlichen Trigger auf `bz_kontrollen` (S2), die
   **vier** zusätzlichen Indizes (S3), und Formatierungsunterschiede in der `CREATE TABLE`-Ausgabe,
   die `drizzle-kit` beim Quetschen erzeugt. **Jede weitere Zeile im Diff ist ein Fehler**, kein
   Geschmack. Erst wenn dieser Diff so aussieht, ist §4 eingelöst.

**Was NICHT passiert, obwohl es naheliegt.** Die produktive `lagerbuch.db` wird **nicht** als Datei
kopiert. Sie trüge dann lagerbuchs eigene `__drizzle_migrations`-Tabelle mit sieben Einträgen, deren
`when`-Werte (1783690310333 … 1785256324320) gegen den neuen `folderMillis` stünden. Der Ausgang wäre
kein Datenverlust — `dialect.cjs:677,694` klammert das Replay in `BEGIN`/`ROLLBACK`, es wäre ein
**Startabbruch mit unversehrten Daten** (Rohbefund 5 der Analyse, widerlegt in dieser Schärfe) — aber
es wäre ein Startabbruch der **ganzen Suite**, weil `migrateAllModules()` alle Module in einer
Schleife fährt. Der Weg ist der zeilenweise Import in eine frisch migrierte Datei; die
schemaseitigen Auflagen dafür stehen in §4.14, das Runbook selbst gehört ins Cutover-Kapitel.

---

### 4.4 Append-only: was der Trigger abriegelt, was er nicht abriegelt, und was daraus folgt

**Was `0001` genau tut.** Zwei `BEFORE`-Trigger auf **einer** Tabelle:

```sql
CREATE TRIGGER buchungen_no_update BEFORE UPDATE ON buchungen
BEGIN SELECT RAISE(ABORT, 'journal ist append-only'); END;
--> statement-breakpoint
CREATE TRIGGER buchungen_no_delete BEFORE DELETE ON buchungen
BEGIN SELECT RAISE(ABORT, 'journal ist append-only'); END;
```

Es ist **kein** Konventionsschutz und **keine** Anwendungsprüfung: die Datenbank bricht jedes `UPDATE`
und jedes `DELETE` auf `buchungen` ab, unabhängig davon, welcher Prozess es fährt — auch eine
`sqlite3`-Sitzung von Hand. Es ist die einzige Invariante des Moduls, die nicht im Code steht.

**Was daraus für Korrekturen folgt.** Es gibt genau einen Korrekturweg: **eine neue Zeile vom Typ
`korrektur`**. Das ist keine Stilfrage, sondern der einzige mechanisch mögliche Weg, und alle
Schreibpfade folgen ihm bereits (`src/db/korrektur.ts:35-38`, `src/actions/inventur.ts:44`,
`src/actions/csv.ts:33-40`). Für das Zielmodul heißt das: **keine Server Action, kein Aufräumjob und
kein Verwaltungsknopf darf `db.update(buchungen)` oder `db.delete(buchungen)` enthalten.** Der
Wächter dafür ist der Trigger selbst plus `_db/append-only.test.ts` (§4.16).

**Was daraus für den Import folgt** — drei gemessene Punkte, alle drei in diesem Kapitel, weil sie
Eigenschaften des Schemas sind, nicht des Skripts:

| Verfahren | Ergebnis | Konsequenz |
|---|---|---|
| `INSERT` (erster Lauf) | läuft durch | der Regelfall |
| `onConflictDoUpdate` (Muster beider vorhandener Importer) | **`FAILED: journal ist append-only`** beim zweiten Lauf | **verboten für `buchungen`** |
| `INSERT OR IGNORE` / `onConflictDoNothing` | läuft durch, Zeile bleibt unverändert | **das vorgeschriebene Idiom**; steht schon in beiden Repos (`seed-handlager.ts:9`) |
| `INSERT OR REPLACE` | **läuft durch und umgeht den Trigger** bei `recursive_triggers = 0` | **die Falle.** Selbst nachgemessen an `better-sqlite3` ^12.11.1: Default ist `recursive_triggers: 0`, `INSERT OR REPLACE` schreibt den Wert stillschweigend um; mit `PRAGMA recursive_triggers = ON` bricht derselbe Aufruf ab. `openModuleDatabase` setzt genau vier Pragmas (`core/db/index.ts:18-21`), dieses ist **keines davon** |

Wer einen Abbruch mit `INSERT OR REPLACE` „repariert", hebelt die Append-only-Zusage lautlos aus —
und der Paritätscheck bleibt grün, weil er nur Zeileninhalte vergleicht.

**Entscheidung 5 — die Logbücher, gespalten.** Die Analyse lässt sie offen; hier fällt sie auf
**Option (c)**: Trigger auf `bz_kontrollen`, **nicht** auf `o2_messungen`.

- **`bz_kontrollen` bekommt die Trigger.** Die Tabelle ist ein Medizinprodukte-Nachweis: sie friert
  in `ref_snapshot` die Referenzbereiche zum Messzeitpunkt ein (`src/actions/bz.ts:115-123`) und ist
  der einzige Grund, warum eine alte Kontrolle nach einer Umkonfiguration des Geräts noch bewertbar
  ist. Die Append-only-Zusage steht heute nur als Kommentar (`src/actions/bz.ts:91`). **Geprüft, dass
  nichts bricht:** `grep -rn "delete(bzKontrollen)\|update(bzKontrollen)" src/` liefert im gesamten
  Alt-Repo **null** Treffer, und der Hard-Delete eines BZ-Geräts ist bereits gesperrt, sobald eine
  Kontrolle existiert (`src/actions/loeschen.ts:101-105` zählt und verweigert, bevor
  `db.delete(bzGeraete)` überhaupt läuft, `:169`). Der Trigger nimmt also keinem laufenden Pfad
  etwas weg; er macht eine Zusage erzwingbar, die heute auf einem Kommentar steht.
- **`o2_messungen` bekommt sie NICHT.** Hier zieht Falle 8 in die Gegenrichtung: der Sauerstoff-Schritt
  des Fahrzeug-Checks ist auf den **Nennfülldruck** vorbelegt (`CheckFlow.tsx:137`), und beim
  Abschluss werden ausnahmslos **alle** Flaschen des Standorts gesendet (`:147-151`) — der Server
  schreibt je Flasche eine Messung (`src/actions/check.ts:140-143`). Wer den Schritt durchklickt,
  erzeugt einen positiv aussehenden, fachlich wertlosen Messwert.

  ⚠️ **Der Einwand, der dagegen steht, und warum er nicht trägt.** Man könnte sagen: beide Tabellen
  haben „jüngster Eintrag gewinnt"-Semantik (`src/db/sauerstoff.ts:35,70`), eine falsche Zeile wird
  also durch Anhängen korrigiert und braucht kein Löschen. Das deckt den **aktuellen Druck** — aber
  nicht die **historische Auszählung**: §5.12 macht `flaschenAuffaellig` je Check zu einer gezählten
  Größe und führt eigens einen Zähler „nicht bewertbar" ein. Eine per Vorbelegung entstandene Zeile
  fällt in **keinen** dieser beiden Zweige: sie sieht plausibel aus, zählt als bewertet und ist über
  den Leseweg nicht korrigierbar. Der Entwurf aus §5.12 erzeugt also selbst den Bedarf an
  Löschbarkeit, den ein Trigger hier wegnähme. `o2_messungen` bleibt damit korrigierbar, und die
  Möglichkeit einer späteren Aktion „Messung verwerfen" bleibt offen.

**`checks` und `lagerort_verfall` bekommen ausdrücklich KEINE Trigger** — obwohl 1:1-Pflicht 6 zu
Recht anmerkt, dass sie damit nachträglich änderbar bleiben:

- **`lagerort_verfall` ist per Entwurf kein Nachweis, sondern Ist-Zustand.** `schema.ts:85-86` legt
  einen `uniqueIndex` über `(lagerort_id, artikel_id)`, und `setzeVerfall` schreibt per
  `onConflictDoUpdate` (`src/db/lagerort-verfall.ts:56-62`); ein leerer Wert **löscht** die Zeile
  (`:51-53`, `:66-70`). Ein Trigger würde die Tabelle unbenutzbar machen.
- **`checks` trägt eine nullbare `completed_at`** (`schema.ts:155`) — das Schema sieht also einen
  offenen, später abzuschließenden Check ausdrücklich vor, auch wenn heute nur der geschlossene Fall
  gebaut ist (`src/actions/check.ts:164-167` schreibt `startedAt` und `completedAt` in **einem**
  Insert). Ein `UPDATE`-Trigger würde diese Bauform für immer versperren. Der Nachweischarakter der
  Tabelle wird stattdessen durch `pruefeFahrzeug` geschützt, das ein Fahrzeug mit Checks nicht löschen
  lässt (`loeschen.ts:72,81`).

---

### 4.5 Zeit — eine Einheit, eine Zone, sechzehn Spalten

**Einheit: UNIX-Sekunden, Drizzle `mode: "timestamp"`. Niemals `timestamp_ms`.**
Selbst nachgemessen gegen `drizzle-orm` ^0.45.2 / `better-sqlite3` ^12.11.1 aus dem Suite-Repo:
`insert(… ts: new Date(1770000000789))` legt in der Spalte **`1770000000`** ab (zehnstellig,
Millisekunden abgeschnitten) und liest sie als `1770000000000` zurück. Quelle und Ziel führen dieselben
Paketversionen (`lagerbuch/package.json`, `iuk-suite/package.json`), die Einheit ist also über den
Umzug hinweg identisch.

⚠️ **Die 1000er-Falle ist hier scharf und paritätsgrün.** `m/qr/_db/schema.ts:19-20` benutzt
`timestamp_ms`; ein Copy-Paste von dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler. Eine
„vorsichtige" Multiplikation mit 1000 beim Import wäre in **beiden** Armen des Paritätschecks dieselbe
Umrechnung — der Check bliebe grün, während das ganze Journal um Jahrtausende umdatiert wäre
(1:1-Pflicht 7). `_db/migrations.test.ts` prüft deshalb den **rohen** Spaltenwert auf zehn Stellen
(§4.16).

**Die sechzehn Zeitspalten — Einheit steht in der Beschreibung, nicht im Kommentar.**

| # | Tabelle.Spalte | Nullbar | Einheit | Was sie bedeutet |
|---|---|---|---|---|
| 1 | `fahrzeug_templates.created_at` | nein | UNIX-**Sekunden** | Anlage der Vorlage |
| 2 | `artikel.bestellt_at` | **ja** | UNIX-**Sekunden** | „bestellt"-Markierung; **wird bei jedem Zugang genullt** (`buchung.ts:42`) — der vorherige Wert ist danach unwiederbringlich weg |
| 3 | `artikel.created_at` | nein | UNIX-**Sekunden** | Anlage des Artikels |
| 4 | `chargen.created_at` | nein | UNIX-**Sekunden** | Anlage der Charge; **Tiebreaker** bei der Wahl der „jüngsten Charge" (`korrektur.ts:30`, `inventur.ts:38`) **und** in der FEFO-Sortierung (§5.3.1) |
| 5 | `lagerort_verfall.erfasst_at` | nein | UNIX-**Sekunden** | Zeitpunkt der letzten Meldung; wird beim Upsert **überschrieben** (`lagerort-verfall.ts:60`) |
| 6 | `buchungen.ts` | nein | UNIX-**Sekunden** | Buchungszeitpunkt. **Sekundengranularität ist hier fachlich sichtbar:** ein Check-Abschluss schreibt Abgleich, Umlagerung und Messungen in einem Rutsch, alle Zeilen teilen dieselbe Sekunde (Falle 3) |
| 7 | `tokens.created_at` | nein | UNIX-**Sekunden** | Ausstellung des Zugangs-Codes |
| 8 | `tokens.last_used_at` | **ja** | UNIX-**Sekunden** | letzte Einlösung; **reines Anzeigefeld**, ein Leser (`TokenTable.tsx:67`: „nie benutzt" gegen „zuletzt …"). Der heutige Löschbarkeitsschalter (`loeschen.ts:90-97`: benutzt ⇒ nur sperrbar) entfällt mit Entscheidung 8-F (§8.3) |
| 9 | `checks.started_at` | nein | UNIX-**Sekunden** | heute gleich `completed_at` (ein Insert) |
| 10 | `checks.completed_at` | **ja** | UNIX-**Sekunden** | `NULL` = offener Check; **Filter- und Sortierspalte** der Check-Historie (`queries.ts:352-360`) |
| 11 | `users.last_login_at` | **ja** | UNIX-**Sekunden** | letzter Login |
| 12 | `bz_geraete.created_at` | nein | UNIX-**Sekunden** | Anlage des BZ-Geräts |
| 13 | `bz_kontrollen.ts` | nein | UNIX-**Sekunden** | Messzeitpunkt; Sortierspalte (`idx_bz_kontrollen_geraet_ts`) |
| 14 | `o2_flaschen.created_at` | nein | UNIX-**Sekunden** | Anlage der Flasche |
| 15 | `o2_messungen.ts` | nein | UNIX-**Sekunden** | Ablesezeitpunkt; Sortierspalte (`idx_o2_messungen_flasche_ts`) |
| 16 | `geraete.created_at` | nein | UNIX-**Sekunden** | Anlage des Geräts |

**Zone: `Europe/Berlin`, als Modulkonstante — nicht als Prozessumgebung.**
Der Betreiber hat `TZ=Europe/Berlin` als Annahme gesetzt; das **Setzen selbst** ist ein suiteweiter
Eingriff mit eigener Prüfung gegen vier laufende Module und **nicht Teil dieser Spec** (§1.5). Genau
daraus folgt die Entscheidung: **lagerbuch darf sich nicht darauf verlassen.** Entscheidung 26 fällt
auf **Option (b)** — explizite Zonenrechnung in einem modul-eigenen `_lib/zeit.ts`, nach dem Vorbild
von `m/feedback/_lib/lifecycle.ts:6` (`export const TIME_ZONE = "Europe/Berlin"`), dazu die
zonenexplizite Umrechnung `zonedTimeToUtc` bei `:53`. ⚠️ Diese Hilfsfunktion ist dort **modul-privat**
(kein `export`), lagerbuch schreibt also eine eigene. Damit gibt es die Zonenrechnung ab jetzt in
**zwei** Modulen — die Suite-Regel für `core` („nur was ein zweites, heute belegbares Modul braucht")
ist damit erstmals erfüllt. Eine Hebung nach `core/zeit` ist eine eigene Entscheidung und wird hier
**nicht** nebenbei vollzogen (§15).

**Das kostet weniger, als die Analyse veranschlagt** („macht aus dem Umzug an dieser Stelle eine
Umschreibung"), weil die gesamte Oberfläche ohnehin in Ant Design 6 neu gebaut wird: die Formatierer
werden neu geschrieben, egal welche Option gewählt wird. Und es kauft vier Dinge:

- **Unabhängigkeit von einem Schritt, der nicht in dieser Spec steht.** Wird `TZ` nie gesetzt oder
  später zurückgenommen, ändert sich an lagerbuch nichts.
- **Reproduktion des Alt-Verhaltens.** `lagerbuch/compose.yaml:7` setzt `TZ=${TZ:-Europe/Berlin}` —
  das ist ein **Default, keine Messung**; die tatsächliche Prod-Belegung steht in der gitignorierten
  `stack.env`. ⚠️ **Runbook-Eingabe: den produktiv wirksamen `TZ`-Wert der Alt-Instanz ablesen.**
  `Europe/Berlin` ist der Wert, den der Port reproduziert; weicht die Alt-Instanz ab, verschieben sich
  Anzeigezeiten (nicht Daten) um die Differenz und das gehört ins Cutover-Protokoll.
- **Testbarkeit ohne suiteweiten Eingriff.** `iuk-suite/vitest.config.ts` hat heute keinen `env`-Block;
  unter (b) braucht es auch keinen, weil die Zone im Code steht. Ein Test, der die Zone **absichtlich**
  verstellt, beweist dann die Unabhängigkeit (§4.16). **Genau daran hängt die Entscheidung aus
  §12.6, Punkt 1**, keinen globalen `TZ`-Pin in die Suite-Testkonfiguration zu ziehen.
- **Die Client-/Server-Divergenz der Verfall-Ampel verschwindet.** `verfallStatus` rechnet das
  Monatsende künftig über `monatsEnde()` aus `_lib/zeit.ts`; ob die Funktion im Browser oder im
  Container läuft, ändert das Ergebnis nicht mehr. Der Fall aus §7.9.3 (Chip im Zählschritt gegen
  Zahl in der Abschlussmeldung) ist damit strukturell ausgeschlossen statt bloß unwahrscheinlich.

**Was die Zone NICHT berührt: gespeicherte Bytes.** Alle sechzehn Spalten sind absolute UNIX-Sekunden;
eine Zone wirkt ausschließlich auf **Ableitungen**. Betroffen sind genau fünf Ableitungen, alle heute
mit prozesslokaler Arithmetik gebaut:

| Ableitung | heute | im Ziel |
|---|---|---|
| Monatsende eines Verfalls | `new Date(y, m, 0, 23,59,59,999)` (`src/lib/domain/verfall.ts:10`) | `monatsEnde(verfall)` aus `_lib/zeit.ts` |
| Tagesbeginn für MTK/Ablauf | `new Date(now.getFullYear(), now.getMonth(), now.getDate())` (`src/lib/domain/geraet.ts:37`) | `startDesTages(now)` |
| Journal-Anzeige „TT.MM. HH:MM" | `getHours()/getMinutes()` (`src/lib/format.ts:14`) | `fmtTs(d)` |
| inklusive Journal-Filtergrenzen | `src/lib/format.ts:21-26` | `tagesGrenzen(datum)`, benutzt von `zeitraumAus` (§5.14.2) |
| Excel-Dateiname `bestand-YYYY-MM-DD.xlsx` | lokale Komponenten (`src/lib/bestand-export.ts:55-57`) | `heuteIso(now)` |

**`_lib/zeit.ts` — Vertrag, verbindlich.** Die Datei trägt **kein** `"use client"` (Falle 6, §4.15):

```ts
export const ZEITZONE = "Europe/Berlin";

/** Offset der Zone zum Zeitpunkt `at`, in Minuten (positiv = östlich von UTC). */
function zonenOffsetMin(at: Date): number;

/** Zivilzeit in ZEITZONE → absoluter Zeitpunkt. Zweistufig, weil der Offset selbst
 *  vom Ergebnis abhängt (Sommer-/Winterzeit). */
export function ausZivilzeit(
  jahr: number, monat1bis12: number, tag: number,
  std?: number, min?: number, sek?: number, ms?: number,
): Date;

/** Letzter Tag des Monats "YYYY-MM", 23:59:59.999 Ortszeit. */
export function monatsEnde(verfall: string): Date;
/** Mitternacht des Tages, in den `now` in ZEITZONE fällt. */
export function startDesTages(now: Date): Date;
/** Inklusive Grenzen eines Tages "YYYY-MM-DD" als absolute Zeitpunkte. */
export function tagesGrenzen(datum: string): { von: Date; bis: Date };
/** "TT.MM. HH:MM" in ZEITZONE — das Journalformat. */
export function fmtTs(d: Date): string;
/** "YYYY-MM-DD" in ZEITZONE — der Excel-Dateiname. */
export function heuteIso(now?: Date): string;
/** "HH:MM" in ZEITZONE — die Ablaufzeit der Helfer-Sitzung im Helfer-Rahmen (§3.4.3, §7.8.2).
 *  Sie steht hier und nicht in `_lib/format.ts`, weil auch sie Zonenrechnung ist. */
export function uhrzeit(d: Date): string;
```

⚠️ **`fmtTs` und `tagesGrenzen` liegen hier und nicht in `_lib/format.ts`** — sie sind Zonenrechnung,
und die soll genau eine Heimat haben. `_lib/format.ts` (§5.14.2) baut darauf auf: `zeitraumAus`
validiert die Eingabe und erzeugt die Hinweistexte, die Grenzen selbst kommen aus `tagesGrenzen`.

**Regel, die das Kapitel bindet:** außerhalb von `_lib/zeit.ts` steht im Modul **kein**
`new Date(jahr, monat, …)` mit mehr als einem Argument und **kein** `getHours`/`getMinutes`/
`getFullYear`/`getMonth`/`getDate` auf einem Datum, das dem Nutzer gezeigt oder mit einem Tagesrand
verglichen wird. Diese Regel ist grep-bar und gehört in das Review jeder Datei dieses Moduls.

⚠️ **Zwei DST-Ränder, die `ausZivilzeit` benannt entscheidet** (und die §4.16 festnagelt): der letzte
Märzsonntag hat keine Ortszeit 02:30 (Sprungloch → das Ergebnis ist 03:30 Ortszeit), der letzte
Oktobersonntag hat sie zweimal (Doppeldeutigkeit → die **erste**, also die Sommerzeit-Lesart, gewinnt).
Für `monatsEnde` und `startDesTages` ist beides folgenlos, weil weder 23:59:59.999 noch 00:00:00 je in
den Berliner Umstellungsrand fallen — genau deshalb ist die Regel billig und muss trotzdem
aufgeschrieben werden.

---

### 4.6 Textdatumsfelder — drei Monats-, zwei Tagesfelder, und die Frage nach dem CHECK

**Fünf Spalten sind TEXT und tragen ein Datum**, nicht als Zeitstempel, sondern als Zeichenkette:

| Spalte | Format | Nullbar | Bedeutung |
|---|---|---|---|
| `chargen.verfall` | `"YYYY-MM"` | nein | Ablauf = **letzter Tag** des Monats; **`"2099-12"` ist der Sentinel für „kein Verfall"** |
| `lagerort_verfall.verfall` | `"YYYY-MM"` | nein | frühester Verfall dieses Artikels **im Fahrzeug** (§4.11) |
| `bz_kontrollen.kompresse_verfall` | `"YYYY-MM"` | **ja** | Kompressenverfall zum Messzeitpunkt |
| `geraete.mtk_faellig` | `"YYYY-MM-DD"` | **ja** | nächste Medizinprodukte-Kontrolle, tagesgenau |
| `geraete.ablaufdatum` | `"YYYY-MM-DD"` | **ja** | Ablauf eines Objekts, tagesgenau |

Ein Paritätscheck vergleicht sie **zeichenweise** und ist hier trivial grün — während genau hier die
Zone in die abgeleitete Ampel hineinwirkt (1:1-Pflicht 18). Die Ampel ist also **nicht** 1:1, wenn die
Zone nicht 1:1 ist; §4.5 löst das.

**Zwei Validatoren für dasselbe Feld — Entscheidung 6.** Heute stehen im Repo zwei Ausdrücke
nebeneinander:

- **streng:** `MONAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/` (`src/db/lagerort-verfall.ts:10`), benutzt vom
  Check-Verfall (`src/actions/check.ts:58`).
- **lax:** `/^\d{4}-\d{2}$/` beim Chargen-Zugang (`src/actions/buchung.ts:17`) und beim
  BZ-Kompressenverfall (`src/actions/bz.ts:83`).

Nachgestellt in der Analyse und hier nachvollzogen an `verfall.ts:8-12`: `"2026-00"` passiert den laxen
Ausdruck; `verfallStatus` zerlegt per `split("-").map(Number)` und rechnet `new Date(2026, 0, 0, …)` =
**31.12.2025** — die Charge gilt ab dem Anlegen als abgelaufen, erscheint in der Verfall-Liste als
Aufgabe und ist per Aussondern-Korrektur ausbuchbar. `"2026-13"` landet auf dem 31.01.2027.

**Entschieden: (a) + (c), ohne (b).**

- **(a) Alle Eingangsprüfungen laufen über `MONAT_REGEX`.** Die Konstante zieht nach
  `_lib/konstanten.ts` (ohne `"use client"`, §4.15) und ist der **einzige** Monatsvalidator des
  Moduls; `buchung.ts:17` und `bz.ts:83` bekommen ihn. Dazu die zwei Eingabefelder, die heute die
  einzige Bremse davor sind: `ArtikelDrawer.tsx:307` (Zugang) und `KontrolleForm.tsx:71`
  (BZ-Kontrolle) — ihr antd-Ersatz muss dieselbe Strenge tragen (das ist eine Auflage an §6, dort
  eingelöst in §6.11; hier steht sie, weil sie eine Datenintegritätszusage ist, keine
  Gestaltungsfrage). ⚠️ **Es sind drei Felder, nicht zwei:** `VerfallEditor.tsx:58` (Lagerort-Verfall
  am Fahrzeugblatt) trägt ebenfalls ein `<input type="month">` und schreibt nach `lagerort_verfall`
  (`src/db/lagerort-verfall.ts:9` nennt dasselbe Format). Es fällt unter dieselbe Auflage.
- **Kein CHECK-Constraint (b).** Zwei Gründe. Erstens: ob die produktive Datenbank Werte außerhalb
  `01`–`12` enthält, steht nicht im Repo; ein CHECK in der Migration wäre ein Import, der an Daten
  scheitert, die niemand gesehen hat. Zweitens: SQLite kann Constraints nicht nachträglich
  hinzufügen — es bräuchte einen Tabellen-Neubau von `chargen`, und `chargen` wird per
  Fremdschlüssel von `buchungen` referenziert (`schema.ts:96`). Und er schützt das Falsche: die
  FEFO-Reihenfolge sortiert per `localeCompare` über den **String** (`src/lib/domain/fefo.ts:10`),
  sie ist gegen `"2026-13"` gar nicht empfindlich — empfindlich ist allein `verfallStatus`, und das
  ist Anwendungscode.
- **(c) Bestandsprüfung vor dem Cutover, Korrektur in der Alt-App.** ⚠️ **Runbook-Eingabe**, gegen die
  produktive Datei zu fahren, in der Generalprobe **und** am Cutover-Abend:

  ```sql
  SELECT 'chargen' AS tabelle, id, verfall FROM chargen
    WHERE verfall NOT GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
       OR substr(verfall,6,2) NOT BETWEEN '01' AND '12'
  UNION ALL
  SELECT 'lagerort_verfall', id, verfall FROM lagerort_verfall
    WHERE verfall NOT GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
       OR substr(verfall,6,2) NOT BETWEEN '01' AND '12'
  UNION ALL
  SELECT 'bz_kontrollen', id, kompresse_verfall FROM bz_kontrollen
    WHERE kompresse_verfall IS NOT NULL
      AND (kompresse_verfall NOT GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
        OR substr(kompresse_verfall,6,2) NOT BETWEEN '01' AND '12');
  ```

  **Behandlung von Treffern, verbindlich:** korrigiert wird **vor dem Freeze in der Alt-Anwendung**,
  nicht im Importer. Grund: eine Korrektur im Importer macht den Paritätscheck rot, und ein
  Importer, der einen Wert stillschweigend umschreibt, ist genau die Sorte Feldzuordnungsfehler, die
  ein Paritätscheck nicht findet. **Das ist mechanisch möglich, obwohl das Modul „append-only" heißt:
  in der Alt-Anwendung trägt nur `buchungen` Trigger** (§4.4) — `UPDATE chargen SET verfall = …` und
  `UPDATE bz_kontrollen SET kompresse_verfall = …` laufen dort beide.
  ⚠️ **Die Asymmetrie liegt nicht vor dem Freeze, sondern danach:** ein übersehener Wert in `chargen`
  oder `lagerort_verfall` ist im Zielmodul **nachträglich noch korrigierbar**, ein übersehener Wert in
  `bz_kontrollen` **nicht mehr** — S2 legt genau darauf die Trigger. Für diese eine Tabelle gibt es
  keinen zweiten Versuch, und deshalb läuft die Abfrage in der Generalprobe **und** am Cutover-Abend.
  **Bleibt ein Treffer stehen** (Wert nicht rekonstruierbar), kommt er unverändert mit und wird in der
  Cutover-Notiz namentlich geführt; die Ampel zeigt ihn als abgelaufen, und die Aussonderung ist der
  reguläre fachliche Weg, ihn loszuwerden.

**Die zwei Tagesfelder bleiben ungeprüft, und das ist eine Entscheidung, keine Lücke.**
`geraete.mtk_faellig` und `geraete.ablaufdatum` haben heute überhaupt keinen Eingangsvalidator; die
Robustheit sitzt im Leser: `parseTag` (`src/lib/domain/geraet.ts:16-25`) verlangt `^(\d{4})-(\d{2})-(\d{2})$`
**und** prüft auf überrollende Kalendertage (`2026-02-31` → `null`), und `null` bedeutet
`keinDatum: true` → grau, nicht rot (`:34-36`, ausdrücklich „damit frisch angelegte Geräte keinen
Fehlalarm auslösen"). Diese Toleranz wandert 1:1 mit. Ergänzt wird sie um dieselbe Prüfung **am
Eingang** (`z.string().regex(...).refine(istEchterKalendertag)`), sodass neue Zeilen den Fall nicht mehr
erzeugen; Altzeilen bleiben unberührt.

---

### 4.7 Identifikatoren, Sentinels und feste Schlüssel — die Werte, die auf Papier stehen

**`newId()` = `nanoid()` mit den Vorgabewerten: 21 Zeichen, 64-Zeichen-Alphabet, case-sensitiv.**
`src/db/schema.ts:2,4` importiert `nanoid` und exportiert `export const newId = () => nanoid();` —
ohne Längenargument, ohne eigenes Alphabet. Selbst nachgemessen an der installierten Fassung:
`nanoid().length === 21`, und `urlAlphabet` ist 64 Zeichen lang:
`useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict` — es **enthält `-` und `_`** und
unterscheidet Groß-/Kleinschreibung.

**Das ist 1:1-Pflicht, weil `artikel.id` auf gedruckten Regaletiketten steckt.** Der QR-Inhalt ist
`${base}/a/${id}` (`src/db/etiketten.ts:15,19`), und das Artikel-Regaletikett trägt **keinen
abtippbaren Identifikator** — die URL existiert auf dem Papier ausschließlich als Pixelmuster
(1:1-Pflicht 3, `EtikettenBogen.tsx:37`, `:5-6`). Zwei Folgen für dieses Kapitel:

- **Keine ID wird beim Import neu vergeben.** Für **keine** der 16 Tabellen. Auch nicht dort, wo es
  „egal" wäre: `buchungen.id` ist der Tiebreaker jeder deterministischen Sortierung (§4.14),
  `soll_positionen.id` steht in historischen `checks.ergebnis`-JSONs (`check.ts:102`),
  `tokens.id` steckt im `jose`-Cookie jeder laufenden Helfer-Sitzung (1:1-Pflicht 5).
- **Kein Validator der Form `/^[a-z0-9]+$/`.** Er gäbe für rund jeden 32. Zeichenplatz ein stilles
  404 — und still ist es wörtlich, bis §8.1 (8-C) den wortlosen `redirect("/helfer")` durch einen
  gestalteten Zustand ersetzt.

**Kollisionsprüfung: es gibt genau eine, und sie gilt nicht für `nanoid`.** `newId()` wird an rund
zwanzig Stellen ungeprüft aufgerufen (`artikel.ts:19`, `korrektur.ts:32`, `abbuchung.ts:47`,
`inventur.ts:23,42,44`, `csv.ts:29,34`, `bz.ts`, `lagerort-verfall.ts:57` …). Der Schutz ist der
Primärschlüssel selbst: eine Kollision endet in `UNIQUE constraint failed`, nicht in einer stillen
Überschreibung. Bei 21 Zeichen aus 64 ist das die richtige Abwägung und bleibt so.

**Die eine echte Kollisionsschleife: `tokens.code`.** `src/actions/tokens.ts:10-19`:

```ts
const sixDigits = customAlphabet("0123456789", 6);
// bis zu 20 Versuche; jeder prüft eq(tokens.code, code) gegen die DB
const code = `${d.slice(0, 3)}-${d.slice(3)}`;   // "NNN-NNN", MIT Bindestrich
```

**Alphabet `0123456789`, Länge 6, Darstellung `NNN-NNN` einschließlich Bindestrich** — und der
Bindestrich ist Teil des gespeicherten Werts, nicht der Anzeige. Die Suche ist exakt
(`eq(tokens.code, norm)`, `src/actions/token-redeem.ts:13-14`), also löst `/t/482137` ohne Bindestrich
heute **nicht** auf (1:1-Pflicht 4); §7.5.3 normalisiert deshalb die **Eingabe** auf die Erzeugerform
statt die Spalte aufzuweichen. Der Code ist gleichzeitig QR-Nutzlast, Gate-Eingabe **und**
Anzeigeschlüssel im Journal (`quelle.ts:20,23` schlägt `tokens.code → label` nach) — er darf beim
Import unter keinen Umständen umkodiert oder normalisiert werden.

**Vier feste Werte, die keine nanoid sind und exakt so bleiben:**

| Wert | Wo | Warum er nicht verhandelbar ist |
|---|---|---|
| `"handlager"` als `lagerorte.id` | `src/db/seed-handlager.ts:4` | 75 Fundstellen unter `src/`; jede Entnahme, Inventurkorrektur, Aussonderung und Nachfüllung bucht gegen genau diese ID. Mit `foreign_keys = ON` ist eine andere ID kein Schönheitsfehler, sondern ein FK-Fehler bei der ersten Entnahme — und `loeschen.ts:67` verlöre seinen Schutz vor dem Löschen des Handlagers |
| `"2099-12"` als `chargen.verfall` | `korrektur.ts:33`, `inventur.ts:42`, `csv.ts:31` | kodiert „kein Verfall"; `verfallStatus` liefert dafür grün. Auf `NULL` umgestellt kippen Ampel, Verfall-Liste und die FEFO-Sortierung (`fefo.ts:10` sortiert über den String) für jede so angelegte Charge |
| `"Korrektur"`, `"Inventur"`, `"ohne Verfall"` als `chargen.chargen_nr` | `korrektur.ts:33`, `inventur.ts:42`, `csv.ts:31` | stehen in den Produktionsdaten und sind in der Verwaltung sichtbar. ⚠️ Sie sind **Herkunftshinweis, nicht Bedeutungsträger** — die Bedeutung „ohne Verfall" hängt am Verfallswert (§5.3.2) |
| `"In Ordnung"`, `"Gebrauchsspuren"`, `"Defekt"` in `checks.ergebnis` | `CheckFlow.tsx:22`, ausgewertet in `check.ts:129`, `queries.ts:379`, `:499` | historische `ergebnis`-JSONs tragen die Literale bereits; `"Defekt"` ist der Vertrag der serverseitigen Auswertung an drei Stellen |

**Entscheidung 2 fällt auf (b):** `zustand` bleibt in den Altdaten unberührt (kein Backfill), die drei
Literale ziehen als geteilte Konstante `ZUSTAENDE` in `_lib/konstanten.ts` **ohne** `"use client"`,
und das Zod-Schema der Check-Action nimmt ab jetzt `z.enum(ZUSTAENDE).optional()` statt
`z.string().trim().optional()` (§5.8.2: **beim Schreiben streng, beim Anzeigen tolerant**). Heute steht
`ZUSTAENDE` in `CheckFlow.tsx:22` — einer Client-Datei — und das ist in der Suite genau die falsche
Seite der Grenze (Falle 6, §4.15). Option (c) — Enum plus Backfill der historischen JSONs — ist
verworfen: sie schreibt in einen Nachweis, um eine Typannehmlichkeit zu gewinnen.

---

### 4.8 Die Stammtabellen

#### `lagerorte`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()`, **außer** der festen Zeile `'handlager'` | `schema.ts:7`; 1:1-Pflicht 10 |
| `name` | `text NOT NULL` | Anzeigename („Handlager", „RTW 1") | `:8` |
| `typ` | `text NOT NULL` | Enum `"lager" \| "fahrzeug"`, **ohne** CHECK im SQL | `:9`, `0000:56` |
| `kennung` | `text NULL` | amtliches Kennzeichen; **suchbar** in der Fahrzeugauswahl (`ChecksFilter.tsx:27` über `keywords`) | `:10` |
| `aktiv` | `integer NOT NULL DEFAULT true` | Boolean; inaktive Fahrzeuge fallen aus `/helfer/check` (`page.tsx:14`) | `:11` |
| `template_id` | `text NULL` → `fahrzeug_templates.id` | `NULL` = individuell gepackt (Alt-Verhalten) | `:15`, `0004:20` |

**Der Fremdschlüssel zeigt „rückwärts"** — `lagerorte` → `fahrzeug_templates`, obwohl `lagerorte` die
ältere und zentralere Tabelle ist. Das ist kein Fehler, aber es bestimmt die Einfügereihenfolge des
Imports (§4.14).

#### `artikel`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` — **steht als QR auf jedem Regaletikett** | `:45`; 1:1-Pflicht 3 |
| `name` | `text NOT NULL` | getrimmt, nichtleer (`artikel.ts:10`) | `:46` |
| `einheit` | `text NOT NULL` | freier String („Stk.", „Pkg.", „Fl.", „Box") — **kein** Enum | `:47` |
| `fach` | `text NOT NULL` | Lagerplatz im Handlager („A2"); **suchbar** über `keywords` (`SollEditor.tsx:93`) | `:48` |
| `mindestbestand` | `integer NOT NULL DEFAULT 0` | Stückzahl; Grundlage des Bestellvorschlags | `:49` |
| `aktiv` | `integer NOT NULL DEFAULT true` | inaktiv ⇒ Status `"inaktiv"` im Excel-Export, schlägt alles | `:50` |
| `bestellt_at` | `integer NULL` | UNIX-**Sekunden**; **wird bei jedem Zugang genullt** (`buchung.ts:42`) — nicht rekonstruierbar (§5.5) | `:51` |
| `created_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:52` |

**Der Bestellvorschlag ist die Lücke, und `BESTELL_FAKTOR` wird ersatzlos gestrichen.** Der Betreiber
hat entschieden (Antworten 7 und 8 vom 03.08.2026): es gilt
`vorschlagsmenge = Math.max(0, mindestbestand − bestand)` (`src/lib/domain/vorschlag.ts:7-12`, mit dem
ausdrücklichen Kommentar „Kein Faktor/Puffer" bei `:5-6`). Nachgeprüft: `config.ts:38` deklariert
`BESTELL_FAKTOR`, `:76` mappt es auf `config.bestellFaktor`, und **kein Produktivpfad liest das Feld** —
die einzigen Fundstellen außerhalb der Konfiguration sind ein Mock (`bestellung.test.ts:4`) und die
Parse-Prüfung (`config.test.ts:15,27`); **diese drei Teststellen werden mitgestrichen**, sonst
konservieren sie eine Variable, die es nicht mehr gibt. Die Faktor-Formel aus
`implementierungsplan.md:75/:202` ist damit eine nie eingelöste Planzeile. **Für das Datenmodell heißt
das: keine Spalte, keine Konfigurationsvariable, kein Feld.** Ein `BESTELL_FAKTOR` in der produktiven
`stack.env` wird beim Cutover nicht übernommen — und es ist ausdrücklich kein Beweis dafür, dass jemand
ein anderes Verhalten erwartet, weil es nie eines erzeugt hat.

#### `chargen`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` | `:58` |
| `artikel_id` | `text NOT NULL` → `artikel.id` | | `:59` |
| `chargen_nr` | `text NOT NULL` | frei; drei Literale sind Herkunftshinweise (§4.7) | `:60` |
| `verfall` | `text NOT NULL` | **`"YYYY-MM"`**, Ablauf = Monatsende; `"2099-12"` = kein Verfall | `:61` |
| `created_at` | `integer NOT NULL` | UNIX-**Sekunden**; Tiebreaker für „jüngste Charge" **und** FEFO-Zweitsortierung (§5.3.1) | `:62` |
| — | `index idx_chargen_artikel_verfall (artikel_id, verfall)` | trägt die FEFO-Abfrage | `:64` |

**`chargen` trägt keine Menge.** Der Rest einer Charge ist `SUM(buchungen.menge)` je `charge_id`,
**lagerort-gescoped**. Die Scoping-Zeile ist kritisch und steht im Alt-Repo ausgeschrieben
(`src/db/abbuchung.ts:19-22`): ohne sie zählte nach der ersten Fahrzeugbuchung derselben Charge der
Fahrzeugbestand als Handlager-Rest mit → Phantombestand und falsche FEFO-Verteilung. Diese Zeile ist
1:1-Pflicht in der Umsetzung von Entscheidung 7 (b) — wer die N+1-Schleife durch **eine**
`GROUP BY`-Abfrage ersetzt, muss `lagerort_id` im Prädikat behalten (§5.2.4).

**Kein `UNIQUE (artikel_id, chargen_nr, verfall)` — entschieden gegen den Aufräumreflex.** Die
Alt-App hat ihn nicht (`schema.ts:55-65`, `0000:32-40`), und `bucheZugang` legt bei „neue Charge"
bedingungslos eine neue Zeile an (`buchung.ts:25-28`). Dieselbe Chargennummer zweimal erfasst spaltet
den Bestand in zwei FEFO-Töpfe mit **identischem** Verfall — die Gesamtmenge stimmt, die
Entnahmereihenfolge zwischen den beiden Töpfen ist unbestimmt. Vier Gründe gegen den Index:

1. Ob die produktive Datenbank solche Paare enthält, **steht nicht im Repo**. Ein `UNIQUE` in der
   Migration wäre ein Import, der an Daten scheitert, die niemand gesehen hat.
2. Die Doppelvergabe ist fachlich nicht immer falsch: zwei Lieferungen mit derselben aufgedruckten
   Chargennummer und demselben Verfall sind ein realer Vorgang.
3. Der Schaden ist eng: gleicher Verfall ⇒ gleiche Ampel, gleiche FEFO-Priorität.
4. ⚠️ **Das Problem, das der Index lösen sollte, ist anders gelöst.** Die unbestimmte
   Entnahmereihenfolge behebt §5.3.1 über einen **Sortier-Tiebreaker** (`verfall`, dann `createdAt`,
   dann `chargeId`) — verhaltensdefiniert, ohne Migration und ohne Annahme über Produktionsdaten.

⚠️ **Runbook-Eingabe (Diagnose, nicht Sperre):**
`SELECT artikel_id, chargen_nr, verfall, count(*) c FROM chargen GROUP BY 1,2,3 HAVING c > 1;` —
das Ergebnis gehört in die Cutover-Notiz, nicht in einen Abbruch.
**Schnittstelle ans Aktionen-Kapitel:** ob `bucheZugang` beim Anlegen einer Charge eine bestehende
`(artikelId, chargenNr, verfall)` wiederverwendet statt eine zweite anzulegen, ist dort zu
entscheiden; das Schema lässt beides zu.

#### `fahrzeug_templates` und `template_positionen`

| Tabelle.Spalte | SQL | Regel | Herkunft |
|---|---|---|---|
| `fahrzeug_templates.id` | `text` PK | `nanoid()` | `:25` |
| `.name` | `text NOT NULL` | | `:26` |
| `.aktiv` | `integer NOT NULL DEFAULT true` | | `:27` |
| `.created_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:28` |
| `template_positionen.id` | `text` PK | `nanoid()` | `:34` |
| `.template_id` | `text NOT NULL` → `fahrzeug_templates.id` | | `:35` |
| `.fach_label` | `text NOT NULL` | Gruppierungstext („Schrank 1 · Verbandmaterial") | `:36` |
| `.sort` | `integer NOT NULL DEFAULT 0` | Sortierschlüssel **innerhalb** eines `fach_label` | `:37` |
| `.artikel_id` | `text NOT NULL` → `artikel.id` | | `:38` |
| `.soll` | `integer NOT NULL` | Stückzahl | `:39` |
| — | `index idx_template_pos_template (template_id)` | | `:41` |

⚠️ **`template_positionen.artikel_id` ist der Fremdschlüssel, den der Löschpfad heute übersieht.**
`pruefeArtikel` (`loeschen.ts:54-64`) zählt `buchungen`, `chargen` und `soll_positionen` — **nicht**
`template_positionen`. Ein Artikel, der nur in einer Fahrzeug-Vorlage steht, meldet `loeschbar: true`,
alle drei Zähler stehen auf 0, und `db.delete(artikel)` (`:166`) wirft `FOREIGN KEY constraint failed`
(reproduziert gegen die echten Migrationen). **Entscheidung 8 fällt auf (a) + (c)** — die vollständige
Fassung steht in §5.21, Punkt 1; für das Datenmodell zählt: die blockierenden Bindungen sind
`buchungen`, `chargen`, `soll_positionen`, **`template_positionen.artikel_id`** und **`tokens.ziel_id`**;
`tokens.scope_lagerort_id` wird **nicht** gezählt (§4.12).

#### `soll_positionen`

| Spalte | SQL | Regel | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` — **steht in historischen `checks.ergebnis`-JSONs** (`check.ts:102`) | `:114` |
| `fahrzeug_id` | `text NOT NULL` → `lagerorte.id` | | `:115` |
| `fach_label` | `text NOT NULL` | | `:116` |
| `sort` | `integer NOT NULL DEFAULT 0` | | `:117` |
| `artikel_id` | `text NOT NULL` → `artikel.id` | | `:118` |
| `soll` | `integer NOT NULL` | | `:119` |
| `template_position_id` | `text NULL` → `template_positionen.id` | `NULL` = manuell/individuell; gesetzt = aus der Vorlage materialisiert | `:122` |
| `ueberschrieben` | `integer NOT NULL DEFAULT false` | manuell abweichend ⇒ der Sync lässt die Zeile in Ruhe | `:124` |
| `entfernt` | `integer NOT NULL DEFAULT false` | **Grabstein**: zählt nirgends als Soll, verhindert aber, dass der Sync die Vorlagen-Position wieder anlegt | `:127` |
| — | `index idx_soll_fahrzeug (fahrzeug_id)` | | `:129` |

Die drei Spalten aus `0004` sind der ganze Vorlagen-Mechanismus: der Check-Flow läuft unverändert
gegen `soll_positionen`, weil die Vorlage dorthin **materialisiert** wird. Wer beim Neubau `entfernt`
als „soft delete" missversteht und die Zeilen wegfiltert **bevor** der Sync läuft, legt sie beim
nächsten Sync wieder an (§5.7).

#### `geraete`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` | `:259` |
| `typ` | `text NOT NULL` | Enum `"medizin" \| "objekt"`, ohne CHECK | `:260` |
| `barcode` | `text NULL UNIQUE` | **byte-exakt, ohne Bereinigung**; nullable + unique (SQLite erlaubt mehrere `NULL` im UNIQUE) | `:263`, `0005:16` |
| `name` | `text NOT NULL` | | `:264` |
| `lagerort_id` | `text NOT NULL` → `lagerorte.id` | **die einzige Zuordnung** — kein Soll-/Vorlagen-Apparat wie bei Artikeln | `:265` |
| `anmerkung` | `text NULL` | beide Typen | `:266` |
| `mtk_faellig` | `text NULL` | **`"YYYY-MM-DD"`**, nur `typ='medizin'` | `:268` |
| `beschreibung` | `text NULL` | nur `typ='objekt'` | `:270` |
| `ablaufdatum` | `text NULL` | **`"YYYY-MM-DD"`**, nur `typ='objekt'` | `:271` |
| `aktiv` | `integer NOT NULL DEFAULT true` | | `:272` |
| `created_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:273` |
| — | `index idx_geraete_lagerort (lagerort_id)` | | `:275` |

⚠️ **Die Barcode-Eindeutigkeit ist tabellenübergreifend, aber nur eine Anwendungsprüfung.**
`geraete.barcode` und `bz_geraete.barcode` haben je einen **eigenen** `UNIQUE`-Index
(`0005:16`, `0002:18`); die Eindeutigkeit **über beide Tabellen** lebt ausschließlich in
`pruefeBarcodeFrei` (`src/db/barcode.ts:12-25`). `/g/<code>` löst „erst `geraete`, dann `bz_geraete`"
auf (`src/app/g/[code]/page.tsx:29-33`), eine Doppelvergabe verschattet also still den zweiten Treffer.
Zwei Auflagen: der Import darf `pruefeBarcodeFrei` **nicht** umgehen, ohne das Ergebnis zu prüfen, und
⚠️ **Runbook-Eingabe:**
`SELECT barcode FROM geraete WHERE barcode IS NOT NULL INTERSECT SELECT barcode FROM bz_geraete WHERE barcode IS NOT NULL;`
muss leer sein. Die Werte stehen physisch am Gerät, oft herstellergedruckt (EAN_13, EAN_8, ITF) — sie
werden nicht normalisiert, nicht getrimmt, nicht großgeschrieben; die **Eingabe** normalisiert
`normalisiereBarcode` (§7.6.2), und **derselbe Aufruf gilt für den Import**.

---

### 4.9 `buchungen` — das Journal

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` — zeitlich bedeutungslos, aber **deterministischer Totalorder** | `:92` |
| `ts` | `integer NOT NULL` | UNIX-**Sekunden** | `:93` |
| `typ` | `text NOT NULL` | Enum `"zugang" \| "entnahme" \| "korrektur" \| "umlagerung"`, ohne CHECK | `:94` |
| `artikel_id` | `text NOT NULL` → `artikel.id` | | `:95` |
| `charge_id` | `text NOT NULL` → `chargen.id` | **NOT NULL** — jede Buchung hat eine Charge, notfalls eine Dummy-Charge | `:96` |
| `lagerort_id` | `text NOT NULL` → `lagerorte.id` | | `:97` |
| `menge` | `integer NOT NULL` | **vorzeichenbehaftet**: Zugang +, Entnahme − | `:98` |
| `quelle_typ` | `text NOT NULL` | Enum `"token" \| "oidc" \| "system"` | `:99` |
| `quelle_id` | `text NOT NULL` | bei `token` der **Code-Klartext** `NNN-NNN`, bei `oidc` der Pocket-ID-`sub` | `:100` |
| `referenz` | `text NULL` | Präfixe `check:<id>`, `inventur:<id>`, `entnahme-ziel:<lagerortId>` | `:101` |
| `kommentar` | `text NULL` | Freitext; **das Suchfeld des Journals durchsucht ihn per SQL-`LIKE`** (§5.13.2) | `:102` |
| — | `index idx_buchungen_artikel (artikel_id)` | | `:105` |
| — | `index idx_buchungen_charge (charge_id)` | | `:106` |
| — | `index idx_buchungen_ts (ts)` | | `:107` |

**Der Buchungstyp `umlagerung` ist tragend und fehlt im Implementierungsplan** (dort stehen nur drei
Typen, `implementierungsplan.md:120`). Beide Legs einer Verschiebung tragen ihn (`src/db/umlagerung.ts:8-9`),
damit Bestellvorschlag und Reporting eine interne Verschiebung nicht als Wareneingang oder Verbrauch
missdeuten. Ein Enum-Entwurf „nach Plan" verliert ihn — und mit ihm die Netto-Null-Eigenschaft jeder
Umlagerung (1:1-Pflicht 15).

**`referenz` ist die einzige Verbindung zwischen Journalzeile und auslösendem Vorgang** — es gibt
**keinen** Fremdschlüssel auf `checks`. Die drei Präfixe stehen in historischen Zeilen und sind damit
Vertrag (1:1-Pflicht 12).

**`quelle_id` ist in drei Tabellen dieselbe Semantik, aber nur eine davon ist triggergeschützt.**
`buchungen` (`:99-100`), `checks` (`:152-153`) und `lagerort_verfall` (`:82-83`) tragen das Paar; dazu
`tokens.created_by` (`:145`), `bz_kontrollen` (`:198-199`) und `o2_messungen` (`:241-242`). Die Trigger
aus `0001` decken **nur** `buchungen` ab, `0002` ergänzt `bz_kontrollen` (§4.4). Die Anzeige löst über
`tokens.code → label` bzw. `users.id → name` auf und fällt still auf die rohe ID zurück
(`src/db/quelle.ts:21-25`, `?? quelleId`). Ein umkodierter Token-Code macht das gesamte historische
Journal namenlos.

⚠️ **Sekundengranularität ist an genau einer Stelle fachlich sichtbar (Falle 3).** `check.ts` schreibt
Abgleich, Umlagerung und Messungen in einem Rutsch mit je eigenem `new Date()`; weil die Spalte
Sekunden speichert, teilen sich alle Zeilen denselben Wert, und `queries.ts:109` sortiert
`orderBy(desc(buchungen.ts))` **ohne Tiebreaker**. Die Reihenfolge innerhalb eines Checks ist damit
unbestimmt. **Entschieden:** die Sortierung wird auf `ORDER BY ts DESC, id DESC` festgenagelt und
bekommt den Index `idx_buchungen_ts_id` (§4.14, §5.14.4). `buchungen.id` ist zeitlich bedeutungslos,
aber deterministisch — der Tiebreaker liefert damit eine **totale**, keine **kausale** Ordnung, und
das gehört ausgeschrieben (§5.14.4). ⚠️ **Damit wird `idx_buchungen_ts` auf `(ts)` präfix-redundant**
— und bleibt trotzdem stehen: die Regel „kein Index wird entfernt" (§4.14) ist keine Nachlässigkeit,
sondern die Bedingung dafür, dass der Schema-Diff aus §4.3 einen abschließenden Erwartungswert hat.
Der Preis ist eine zusätzliche Indexpflege je INSERT in eine Tabelle, aus der nie gelöscht wird. Das
ist **keine** Vorwegnahme von Entscheidung 35: die zwei stillen Obergrenzen (Journal 100,
`queries.ts:87`; Checks 50, `queries.ts:350`) bleiben nach der dortigen Empfehlung **(a)** erhalten und
werden nur ehrlich angezeigt (§5.14.3). Der Index kostet nichts und macht ein späteres
Keyset-Nachladen (Option d) zu einer Query-Änderung statt zu einer Migration.

---

### 4.10 `checks` — und die zwei JSON-Formate in `ergebnis`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()`; steckt als `check:<id>` in `buchungen.referenz` | `:150` |
| `fahrzeug_id` | `text NOT NULL` → `lagerorte.id` | | `:151` |
| `quelle_typ` | `text NOT NULL` | **S1:** bekommt den Drizzle-Enum `"token" \| "oidc" \| "system"`; einziger Produktions-Writer schreibt das Literal `"token"` (`check.ts:165`) | `:152` |
| `quelle_id` | `text NOT NULL` | Token-Code-Klartext | `:153` |
| `started_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:154` |
| `completed_at` | `integer NULL` | UNIX-**Sekunden**; `NULL` = offener Check (heute nie erzeugt, §4.4) | `:155` |
| `ergebnis` | `text NULL` | **JSON-String, zwei Formate** — siehe unten | `:156` |
| — | **neu:** `index idx_checks_fahrzeug_completed (fahrzeug_id, completed_at)` | §4.14 | |

**`checks.ergebnis` trägt zwei inkompatible Formate, und beide bleiben lesbar.** Entschieden:
**der Altformat-Zweig wandert mit.**

- **V1 (alt, vor dem Fahrzeugbestand): ein Array.** Je Element `{ fehlt?, gebucht? }`, ohne
  Positionsdetails. Erkannt an `Array.isArray(raw)` (`queries.ts:367`); die Detailansicht setzt dafür
  `altFormat = true` (`:431-434`) und zeigt leere Positionslisten statt einer Fehlermeldung.
- **V2 (heute): ein Objekt** mit fünf Schlüsseln, geschrieben in `check.ts:167`:
  `{ positionen, artikel, geraete, flaschen, verfall }` (der Insert steht bei `:164-168`).
  - `positionen[]`: `{ sollPositionId, artikelId, soll, ist }` (`check.ts:102`)
  - `artikel[]`: `{ artikelId, positionen, sollSumme, istSumme, recordedVorher, korrektur, nachfuellGewuenscht, nachfuellGebucht }` (`:121`)
  - `geraete[]`: `{ geraetId, vorhanden, zustand, bemerkung }` (`:130`)
  - `flaschen[]`: `{ flascheId, druckBar, nennfuelldruckBar }` (`:147`)
  - `verfall[]`: `{ artikelId, verfall, ampel, abgelaufen }` (`:160-161`)

**Verbindlich:** ein **einziger** Parser in `_lib/checkErgebnis.ts` (ohne `"use client"`) mit der
Signatur `parseCheckErgebnis(roh: string | null): CheckErgebnisV1 | CheckErgebnisV2`, der beide
Formen erkennt und **jeden Lesefehler in einen leeren V2-Wert überführt** — die Alt-App macht das
heute an zwei Stellen dupliziert und jeweils mit einem nackten `catch { }` (`queries.ts:382`,
`:435 ff.`), was funktioniert, aber zweimal gepflegt werden muss. Darauf setzt
`summiereCheckErgebnis` aus `_lib/domain/check.ts` auf (§5.8.3) — **eine** Funktion für Übersicht und
Detail, statt der heutigen Doppelrechnung. Vier Eigenschaften sind dabei 1:1-Pflicht (Nr. 13):

1. **Fällt der V1-Zweig weg, zeigen alte Checks leere Detaillisten** statt der Zusammenfassung — und
   das ist die einzige Auswertung, die es für sie je gab. `altFormat: true` bleibt ein Feld der
   Detailantwort (`queries.ts:412`), und die Detailseite **sagt es** (§11.5, Zustand 26).
2. **Feldnamen im V2-Format sind nicht umbenennbar**, sonst wird jede historische Auswertung stumm 0.
3. **Beide Leser überbrücken gelöschte Artikel/Geräte/Flaschen tolerant** („(gelöschter Artikel)"),
   weil `ergebnis` freies JSON ohne Fremdschlüssel ist.
4. **`geraeteAuffaellig` hängt am Stringvergleich `zustand === "Defekt"`** (`check.ts:129`,
   `queries.ts:379`, `:499`) — §4.7, und ein unbekannter Altwert zählt **nicht** als auffällig.

**Ein fünfter Punkt, der leicht übersehen wird:** `pruefeGeraet` (`loeschen.ts:116-131`) liest
**alle** `checks.ergebnis` und parst sie, um festzustellen, ob ein Gerät je quittiert wurde. Das ist
ein voller Tabellenscan mit JSON-Parse je Zeile im Löschdialog — und der einzige Grund, warum ein
quittiertes Gerät nicht hart löschbar ist. Er wandert mit; wer ihn beim Neubau „optimiert", muss die
Zusage („der Name im Nachweis bleibt lesbar") anders halten.

---

### 4.11 `lagerort_verfall` — die Kompensation, die man beim Aufräumen zerstört

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` | `:77` |
| `lagerort_id` | `text NOT NULL` → `lagerorte.id` | | `:78` |
| `artikel_id` | `text NOT NULL` → `artikel.id` | | `:79` |
| `verfall` | `text NOT NULL` | **`"YYYY-MM"`**, streng validiert über `MONAT_REGEX` | `:80` |
| `erfasst_at` | `integer NOT NULL` | UNIX-**Sekunden**; beim Upsert überschrieben | `:81` |
| `quelle_typ` | `text NOT NULL` | Enum `"token" \| "oidc" \| "system"` | `:82` |
| `quelle_id` | `text NOT NULL` | | `:83` |
| — | `uniqueIndex idx_lagerort_verfall_ort_artikel (lagerort_id, artikel_id)` | **genau eine Angabe je Paar** — eine erneute Meldung ersetzt die alte | `:86` |

**Warum die Tabelle existiert — und warum sie beim Neubau in Gefahr ist.** Bei `diff > 0` wählt
`korrekturAufLagerort` die **jüngste Charge des Artikels ohne jeden Lagerortbezug**
(`src/db/korrektur.ts:27-30`) und legt notfalls eine Dummy-Charge `"Korrektur"` / `"2099-12"` an
(`:32-33`). Der Fahrzeug-Check bucht Fahrzeugbestand also auf eine Charge, die nie im Fahrzeug lag.
`schema.ts:67-73` schreibt die Begründung aus: für die Frage „wann läuft das Zeug im Fahrzeug ab?"
zählt nur, was auf der Packung steht. **Wer das Verfall-Feld im Zähl-Schritt beim antd-Neubau als
redundant streicht („die Charge hat doch einen Verfall"), zerstört diese Kompensation lautlos** — die
Fahrzeug-Verfallsampel hängt danach an einer geratenen Charge, und kein Gate wird rot (Falle 9).
Die Vorschrift dazu steht in §5.3.3; sie steht hier, weil sie erklärt, warum eine scheinbar
redundante Tabelle keine ist.

**Der Upsert überschreibt, die alte Angabe ist danach weg** (`lagerort-verfall.ts:56-62`) — es gibt
keine Historie der Meldungen. Das bleibt so: die Tabelle ist Ist-Zustand, kein Nachweis (§4.4). Ein
leerer Wert löscht die Zeile (`:51-53`).

---

### 4.12 Die Logbücher, `tokens` und `users`

#### `bz_geraete`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` | `:171` |
| `barcode` | `text NULL UNIQUE` | byte-exakt; kreuz-eindeutig mit `geraete.barcode` (§4.8) | `:174` |
| `name` | `text NOT NULL` | | `:175` |
| `lagerort_id` | `text NOT NULL` → `lagerorte.id` | | `:176` |
| `streifen_lot` | `text NULL` | aktuelle Teststreifen-Charge | `:179` |
| `level1_label` / `level2_label` | `text NULL` | z. B. „Level 3" | `:180`, `:183` |
| `level1_min` / `level1_max` | `integer NULL` | Referenzbereich, **bar-frei** (reine Zahl) | `:181-182` |
| `level2_min` / `level2_max` | `integer NULL` | | `:184-185` |
| `aktiv` | `integer NOT NULL DEFAULT true` | | `:186` |
| `created_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:187` |
| — | `index idx_bz_geraete_lagerort (lagerort_id)` | | `:189` |

#### `bz_kontrollen` — **mit Triggern (S2)**

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` | `:195` |
| `geraet_id` | `text NOT NULL` → `bz_geraete.id` | | `:196` |
| `ts` | `integer NOT NULL` | UNIX-**Sekunden** | `:197` |
| `quelle_typ` / `quelle_id` | `text NOT NULL` | Enum `"oidc" \| "token" \| "system"`; `quelle_id` = `users.id` bzw. Token-Code | `:198-199` |
| `level1_wert` / `level2_wert` | `integer NULL` | gemessener Kontrollwert | `:201`, `:203` |
| `level1_im_bereich` / `level2_im_bereich` | `integer NULL` | Boolean, **zum Messzeitpunkt** bewertet | `:202`, `:204` |
| `kompresse_verfall` | `text NULL` | **`"YYYY-MM"`** | `:206` |
| `sticks` / `lanzetten` | `integer NOT NULL DEFAULT 0` | Stückzahlen | `:207-208` |
| `batterie_gewechselt` | `integer NOT NULL DEFAULT false` | | `:209` |
| `kommentar` | `text NULL` | | `:210` |
| `bestanden` | `integer NOT NULL` | Gesamtergebnis | `:211` |
| `ref_snapshot` | `text NULL` | **roher JSON-String — nicht re-serialisieren** | `:213` |
| — | `index idx_bz_kontrollen_geraet_ts (geraet_id, ts)` | | `:215` |

⚠️ **`ref_snapshot` ist der einzige Grund, warum eine alte Kontrolle nach einer Umkonfiguration des
Geräts noch bewertbar ist** (1:1-Pflicht 16). Er entsteht als `JSON.stringify` über sieben Schlüssel in
**dieser** Reihenfolge (`src/actions/bz.ts:115-123`): `streifenLot`, `level1Label`, `level1Min`,
`level1Max`, `level2Label`, `level2Min`, `level2Max`. Ein Import, der ihn **parst und neu
serialisiert**, verändert einen Nachweis — Schlüsselreihenfolge und Zahlenformat sind nicht garantiert
stabil. **Der Wert wandert als opaker String, byte-für-byte.** Der Paritätscheck fängt das, aber nur,
wenn er den Rohwert vergleicht und nicht ein geparstes Objekt. ⚠️ Nachgeprüft ist zusätzlich, dass die
Spalte heute **geschrieben und nirgends gelesen** wird — §5.11 macht sie sichtbar, statt sie zu
streichen.

#### `o2_flaschen` und `o2_messungen`

| Tabelle.Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `o2_flaschen.id` | `text` PK | `nanoid()` | `:223` |
| `.name` | `text NOT NULL` | Name/Kennung | `:224` |
| `.lagerort_id` | `text NOT NULL` → `lagerorte.id` | | `:225` |
| `.groesse_liter` | `integer NULL` | Liter | `:226` |
| `.nennfuelldruck_bar` | `integer NOT NULL DEFAULT 200` | **bar**; Bezugsgröße der Füllstandsampel | `:227` |
| `.aktiv` | `integer NOT NULL DEFAULT true` | | `:228` |
| `.created_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:229` |
| — | `index idx_o2_flaschen_lagerort (lagerort_id)` | | `:231` |
| `o2_messungen.id` | `text` PK | `nanoid()` | `:237` |
| `.flasche_id` | `text NOT NULL` → `o2_flaschen.id` | | `:238` |
| `.ts` | `integer NOT NULL` | UNIX-**Sekunden** | `:239` |
| `.druck_bar` | `integer NOT NULL` | **bar**, abgelesen | `:240` |
| `.quelle_typ` / `.quelle_id` | `text NOT NULL` | Enum wie oben | `:241-242` |
| `.kommentar` | `text NULL` | beim Check: `` `Fahrzeug-Check ${referenz}` `` (`check.ts:142`) | `:243` |
| — | `index idx_o2_messungen_flasche_ts (flasche_id, ts)` | | `:245` |

**`o2_messungen` bleibt ohne Trigger** — Begründung in §4.4. `nennfuelldruck_bar` wandert zusätzlich
als Snapshot ins Check-Ergebnis (`check.ts:147`), damit der Füllstand rekonstruierbar bleibt, wenn die
Flasche umkonfiguriert oder gelöscht wird; das ist derselbe Gedanke wie `ref_snapshot`, nur an einer
anderen Stelle abgelegt. ⚠️ Fehlt der Snapshot in einem Altcheck, wird der Wert **nicht geraten** —
§5.12 ersetzt den heutigen `?? 200`-Rückfall durch `null` plus eigenen Zähler.

#### `tokens`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid()` — **steckt im `jose`-Cookie jeder laufenden Helfer-Sitzung** | `:133` |
| `code` | `text NOT NULL UNIQUE` | **`NNN-NNN`**, sechs Ziffern **mit** Bindestrich (§4.7) | `:134`, `0000:85` |
| `label` | `text NOT NULL` | der Anzeigename im Journal (`quelle.ts:20,23`) — der Code allein sagt niemandem etwas | `:135` |
| `scope_lagerort_id` | `text NULL` → `lagerorte.id` | **tote Spalte, 1:1 erhalten** — siehe unten | `:136` |
| `ziel_typ` | `text NULL` | Enum `"fahrzeug" \| "artikel"`; `NULL` = allgemeiner Zugang | `:141` |
| `ziel_id` | `text NULL` | **bewusst polymorph, ohne FK**: je nach `ziel_typ` eine `lagerorte.id` oder eine `artikel.id` | `:142` |
| `aktiv` | `integer NOT NULL DEFAULT true` | **der einzige Widerruf, den es gibt** | `:143` |
| `created_at` | `integer NOT NULL` | UNIX-**Sekunden** | `:144` |
| `created_by` | `text NOT NULL` | OIDC-`sub` des ausstellenden Kontos (`tokens.ts:47`); **reines Auditfeld — kein Leser im ganzen Repo** | `:145` |
| `last_used_at` | `integer NULL` | UNIX-**Sekunden**; `NULL` = „nie eingelöst", gesetzt = Zeitpunkt der letzten Einlösung. **Ohne Einfluss auf Gültigkeit und auf Löschbarkeit**: die heutige Regel „`NULL` ⇒ löschbar, gesetzt ⇒ nur sperrbar" (`loeschen.ts:89-97`) fällt mit Entscheidung 8-F (§8.3), gesperrt wird über `aktiv`. Einziger Leser ist die Anzeige (`TokenTable.tsx:67`); **der Wert wandert trotzdem vollständig mit** | `:146` |

⚠️ **`aktiv` ist die schärfste Import-Zusage der Tabelle.** Ein Import, der alles als aktiv anlegt,
reaktiviert stillschweigend jeden gesperrten Code — und zwar genau die, die gesperrt wurden, weil ein
laminiertes Kärtchen verschwunden ist (1:1-Pflicht 5). `aktiv`, `last_used_at`, `label`, `ziel_typ`,
`ziel_id`, `scope_lagerort_id` und `id` wandern vollständig.

⚠️ **`scope_lagerort_id` bleibt im Schema, obwohl sie nichts tut — und diese Entscheidung überstimmt
zwei andere Kapitel, die sie streichen wollten.** Belegt: `createToken` schreibt sie nicht
(`tokens.ts:44-49` schreibt `id, code, label, aktiv, createdAt, createdBy, zielTyp, zielId`),
`redeemToken` liest sie nicht (`token-redeem.ts:14-19`), einziger Leser im ganzen `src/` ist der
Löschzähler `loeschen.ts:76`. Sie ist ein nicht zurückgebauter Planrest — `implementierungsplan.md:51`
legt den Sitzungsinhalt auf `{tokenId, scopeLagerortId, exp}` fest, gebaut wurde `{tokenId, code, label}`
(`src/lib/auth/helferSession.ts:6`). **Sie wird trotzdem nicht gestrichen**, weil „kein Produktionspfad
schreibt sie" eine **Code**-Aussage ist und die produktive Tabelle nicht im Repo steht; eine
weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich, und der Import hat keinen zweiten
Versuch. Sie wird stattdessen im Schema als tot markiert, und **der Löschzähler wechselt auf
`ziel_id`** (Entscheidung 8 (a), §5.21): heute zählt `pruefeFahrzeug` (`loeschen.ts:76`) eine Spalte,
die dauerhaft auf 0 steht, während die lebende `tokens.ziel_id` ungeprüft bleibt — ein Fahrzeug ist
löschbar, obwohl ein laminiertes Kärtchen darin auf seine ID zeigt, und der Ausfall ist stumm
(`tokenZiel.ts:10` baut ungeprüft `/helfer/check?fz=<tote-id>`, `helfer/check/page.tsx:28` verwirft
eine unbekannte ID kommentarlos).
⚠️ **Runbook-Eingabe (Diagnose):** `SELECT count(*) FROM tokens WHERE scope_lagerort_id IS NOT NULL;` —
ist das Ergebnis 0, war die Spalte auch in Produktion nie belegt, und der Befund ist geschlossen; die
Spalte kann dann in einer **späteren** Migration fallen, nicht in dieser.

#### `users`

| Spalte | SQL | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | **der OIDC-`sub`** — dieselbe Kennung wie `buchungen.quelle_id` bei `quelle_typ='oidc'` und `tokens.created_by` | `:160` |
| `name` | `text NULL` | Klarname aus dem Login | `:161` |
| `email` | `text NULL` | | `:162` |
| `last_login_at` | `integer NULL` | UNIX-**Sekunden** | `:163` |

**Die Tabelle ist eine reine Nachschlagetabelle für die Anzeige.** `quelleAufloeser`
(`src/db/quelle.ts:12-25`) lädt sie einmal je Request und löst `oidc → users.name`, sonst `email`,
sonst die **rohe ID** auf. Zwei Leser: `queries.ts:112` (Journal) und `sauerstoff.ts:62`.
`tokens.created_by` wird **nirgends** aufgelöst — reines Auditfeld.

---

### 4.13 Identität: der `sub`-Bruch, die Waisenzeilen und warum es KEINE Zuordnungstabelle gibt

**Zwei getrennte Befunde, die leicht verschmelzen.**

**Befund 1 — der belegte Bruch INNERHALB von lagerbuch.** Bis einschließlich `2361f40` schrieb
`src/auth.ts` in einem `events.signIn`-Block `.values({ id: user.id, … })` — nachgelesen mit
`git show 2361f40:src/auth.ts`, Zeile 14. `user.id` ist bei OIDC eine **Zufalls-UUID pro Anmeldung**
(Auth.js vergibt sie bewusst, `konto.ts:10-15` schreibt die Begründung aus). Jede Anmeldung erzeugte
also eine Waisenzeile, die auf keine einzige Buchung passt. `f2b515b` (29.07.2026) behebt das:
`src/auth.ts:11,17` baut den Datensatz jetzt über `kontoAusLogin(user, profile)` mit
`id = profile.sub ?? user.id` (`src/lib/auth/konto.ts:19-23`). **Weil der Freeze auf `ca04eb1` liegt,
ist der Code-Defekt kein Portierungsposten mehr; als Posten bleibt allein der Altbestand.**

**Das Journal selbst ist heil.** Schon `2361f40:src/auth.config.ts:85` holt den echten `sub` aus dem
Profil zurück; alle `quelle_id`- und `created_by`-Werte tragen also die stabile Kennung. **Verseucht
ist ausschließlich die Nachschlagetabelle.** Und: `select count(*) from users` ist **keine**
Personenzahl — das gilt vor wie nach der Bereinigung und gehört in jede Oberfläche, die die Zahl
anzeigen will.

**Befund 2 — der Bruch ZWISCHEN lagerbuch und der Suite. ✅ GEMESSEN, und er existiert nicht.**
Beide Anwendungen sprechen mit derselben Pocket-ID-Instanz, aber heute mit **getrennten
OIDC-Clients**. Die Spec wurde unter der konservativen Gegenannahme geschrieben (Betreiber-Entscheidung
7). Die Discovery der Instanz ist inzwischen abgefragt und liefert
**`subject_types_supported: ["public"]`** — pairwise subject identifiers werden gar nicht angeboten,
der `sub` ist damit **über beide OIDC-Clients identisch**. Der Hinweis, der schon im eigenen Repo
stand, ist damit bestätigt: `src/core/directory/index.ts:36-39` (Suite) führt den Pocket-ID-Quelltext
an, `backend/internal/oidc/claims_service.go:147` → `claims["sub"] = user.ID` — die interne Nutzer-ID,
also clientunabhängig.

⚠️ **Der Entwurf unten ändert sich dadurch nicht, er kollabiert nur** — genau wie angekündigt: „bei
Gleichheit fällt der Weg per Identität zur Nulloperation zusammen". Konkret heißt das für Spec 2:
der erste Suite-Login einer Person trifft **exakt** die importierte `users`-Zeile und aktualisiert
sie; es entsteht keine zweite Zeile, `users` trägt nur **einen** Kennungsraum, und der ausgeschriebene
„sichtbare Preis" weiter unten tritt nicht ein. Was bleibt: die gefilterte Übernahme (ii) und der
Defektzustand (i) — beide hängen nicht an Befund 2.

⚠️ **Der Messwert ist eine Serverangabe, keine Repo-Tatsache.** Er steht hier, weil er erhoben wurde,
und er gehört in dieser Form ins Cutover-Protokoll. Die Runbook-Stichprobe (§3.11, R11) **bleibt** —
sie kostet eine Minute und ist die einzige, die die Messung gegen die **tatsächlichen Daten** hält:
`subject_types_supported` sagt etwas über die Ausstellung heute, nicht darüber, unter welchem Client
und welcher Konfiguration die historischen Zeilen entstanden sind. **Der Paritätscheck beantwortet
die Frage nicht** — er beweist den Rundlauf, nicht die Richtigkeit der Zuordnung, und ist in beiden
Fällen grün.

⚠️ **Damit rückt Befund 1 an die Stelle, die Befund 2 geräumt hat — und er ist der teurere.** Bis
`f2b515b` (29.07.2026) schrieb `src/auth.ts` in `users.id` den Auth.js-`user.id`, also eine
**Zufalls-UUID pro Anmeldung**; erst seither steht dort `profile.sub`. Der Freeze liegt auf `ca04eb1`,
also **fünf Tage** später. Praktisch heißt das: **fast jede `users`-Zeile des Altbestands ist auf eine
Zufalls-UUID geschlüsselt**, und für eine Person, die sich nach dem 29.07. nicht mehr angemeldet hat,
gibt es **keine** Zeile unter ihrem echten `sub`. Ihre Journalzeilen tragen den echten `sub` — das
Journal ist heil (siehe oben) —, finden aber keinen Namen und zeigen die rohe Kennung.

**Der Filter (ii) räumt diese Waisen aus, und genau darin liegt der Posten:** die Waisenzeile ist bei
diesen Personen der **einzige Träger ihres Klarnamens**. Der Weg dorthin ist deshalb **eine
Bereinigung, keine Übersetzungstabelle** — es gibt nichts zu übersetzen, weil die Zufalls-UUID keine
Kennung ist, die irgendwo wiederkehrt. Er geht **nur über die Klarnamen in `users`**: Name und E-Mail
der Waisenzeile identifizieren die Person, und der zugehörige `sub` kommt aus Pocket ID bzw. aus der
Suite (dieselbe Kennung, siehe oben) — nicht aus der Alt-Datenbank. Der Entwurf dazu gehört in Spec 2
(§1.3) und ist **enumerierbare Arbeit an echten Daten**, keine Strukturentscheidung: wie viele
Waisenzeilen es gibt und wie viele Personen ohne `profile.sub`-Zeile dastehen, steht nicht im Repo
(Runbook-Eingabe, §3.11).

⚠️ **Dieselbe Altlast ist in der Suite selbst noch unbereinigt** — Betreiberangabe aus dem
Post-Cutover-Befund zu `feedback`, **nicht** aus diesem Repo belegbar und deshalb hier als solche
markiert. **Folge für die Reihenfolge: die Bereinigung wird EINMAL entworfen und auf BEIDE Bestände
angewandt.** Zweimal entworfen ergäbe zwei Verfahren, die dieselben Personen unterschiedlich
zuordnen — und die Zuordnung ist an beiden Stellen dieselbe Frage „welcher Klarname gehört zu welchem
`sub`". Der Eigentümer des suiteweiten Teils steht in §15.3, Nr. 25; der lagerbuch-Teil bleibt bei
Spec 2.

#### Die Entscheidung: keine Zuordnungstabelle, sondern eine gefilterte `users`-Übernahme

**Entschieden — und das ist eine begründete Abweichung von Entscheidung 27, Empfehlung (a)
(„Tabelle beim Import leeren"):**

**(i) Der Upsert-Ort.** Die Suite hat keinen `events`-Block (Falle 22). Der `users`-Satz entsteht
**pro Anfrage hinter dem Zugriffsriegel**, nach dem `feedback`-Muster — eine Funktion
`merkeNutzer(db, viewer)` in `_lib/konto.ts`, gerufen an genau **einer** Stelle: dem
Verwaltungs-Riegel `requireLagerbuchAdmin` (§3.6.4). Sie legt die Zeile beim ersten Sehen mit
`id = viewer.sub` an und schreibt `name`/`email` mit dem, was die Sitzung trägt. **Beim UPDATE gilt
zusätzlich:** ein späterer Login ohne Klarnamen darf einen bereits bekannten Namen nicht
überschreiben — diese Bedingung steht heute schon so da (`src/auth.ts:22-27`) und ist 1:1 zu
übernehmen. **Sie gilt nur für das UPDATE, nicht für das INSERT**; wer sie auf beides zieht, erzeugt
den Defektzustand unten mit Ansage.

```ts
// _lib/konto.ts
/**
 * Bauform 1:1 aus `m/feedback/_db/queries.ts:83` (upsertKnownUser), Semantik 1:1
 * aus `lagerbuch/src/auth.ts:18-27`.
 *
 * `id` ist der `sub` und niemals `user.id` — Auth.js vergibt bei OIDC je Login
 * eine ZUFALLS-UUID (`lagerbuch/src/lib/auth/konto.ts:10-15`). In der Suite
 * kommt der Wert aus `session.user.id`, das `core/auth/config.ts:171-173` auf
 * `token.sub` legt; die Verwechslung ist hier also nicht mehr moeglich.
 *
 * LAEUFT NACH DEM RIEGEL: nur wer die Pruefung uebersteht, wird zuordenbar.
 * Ein Fehlschlag wird geloggt, nicht geworfen — der Zugang funktioniert auch
 * ohne den Satz, nur das Journal zeigt dann rohe IDs
 * (`lagerbuch/src/auth.ts:29-33` begruendet das bereits so).
 */
export function merkeNutzer(db: DB, viewer: Viewer): void { … }
```

⚠️ **Der benannte Defektzustand: eine Zeile mit `name IS NULL AND email IS NULL`.**
`quelleAufloeser` löst dann `u.name?.trim() || u.email?.trim() || u.id` auf und liefert **die rohe
Kennung** (`src/db/quelle.ts:18`). Der Ausfall im Klartext: eine Person bucht nach dem Cutover, und
das Journal zeigt für **diese** Zeile eine rohe `sub`-Kennung, während ihre Zeilen von **vor** dem
Cutover den Klarnamen tragen — dieselbe Person, zwei Darstellungen, in derselben Liste. Das ist genau
die Regression, die `f2b515b` behoben hat, nur durch eine andere Tür. Zwei mögliche Ursachen, beide
sofort zu melden statt still hinzunehmen: die Suite-Sitzung führt keine `name`/`email`-Claims (dann
schuldet das Auth-Kapitel den passenden OIDC-Scope), oder `merkeNutzer` läuft an einer Stelle, an der
die Claims noch nicht vorliegen. `merkeNutzer` protokolliert den Fall deshalb sichtbar
(`console.warn` mit der Kennung) — so, wie `src/auth.ts:29-33` es heute für den fehlgeschlagenen
Upsert tut („sichtbar loggen statt still schlucken"). Der Test dazu steht in §4.16.

**`core/directory` ersetzt die Tabelle nicht:** es kennt nur, was Pocket ID heute führt, und niemals
die **alten** Kennungen aus dem historischen Journal.

**(ii) Die Altlast — gefilterte Übernahme statt Leerung.** Der Import übernimmt eine `users`-Zeile
**genau dann**, wenn ihre `id` in mindestens einer Autorenschaftsspalte vorkommt:

```sql
SELECT u.* FROM users u WHERE u.id IN (
  SELECT quelle_id FROM buchungen        WHERE quelle_typ = 'oidc'
  UNION SELECT quelle_id FROM checks           WHERE quelle_typ = 'oidc'
  UNION SELECT quelle_id FROM lagerort_verfall WHERE quelle_typ = 'oidc'
  UNION SELECT quelle_id FROM bz_kontrollen    WHERE quelle_typ = 'oidc'
  UNION SELECT quelle_id FROM o2_messungen     WHERE quelle_typ = 'oidc'
  UNION SELECT created_by FROM tokens
);
```

**Warum das besser ist als (a).** Die Waisenzeilen tragen per Konstruktion eine Zufalls-UUID, die in
**keiner** dieser Spalten vorkommt — das Prädikat **ist** der Waisenfilter, und zwar über
Mengenzugehörigkeit statt über Namens- oder E-Mail-Raten (das ist genau die Unsicherheit, wegen der
Option (b) verworfen wurde). Gegenüber (a) kostet es nichts und behält jede Zeile, die tatsächlich
einen Namen auflöst; die Alternative (a) macht das gesamte historische Journal namenlos, bis sich jede
Person einmal neu angemeldet hat — und **bei ungleichen `sub`-Werten heilt sich das nie**, weil die
neue Anmeldung eine neue Kennung schreibt und die alten Journalzeilen die alte tragen. **Die
Abweichung fällt auf (a) zurück, wenn das Prädikat nichts liefert.**

**(iii) Warum es KEINE Zuordnungstabelle `alt_sub → neu_sub` gibt.** Der naheliegende Entwurf wäre
eine 17. Tabelle, die der Resolver hinter `users` konsultiert. Er ist nachgeprüft **unnötig**:

- **Beide Kennungsräume dürfen in `users` nebeneinander existieren.** Historische Zeilen tragen den
  Alt-`sub` und finden ihre (importierte) Alt-Zeile; neue Zeilen tragen den Neu-`sub` und finden die
  vom Upsert geschriebene Zeile. `quelleAufloeser` schlägt in **einer** Map nach (`quelle.ts:13-19`);
  die Map enthält beide. Es gibt keine Kollision, weil beide Werte Primärschlüssel derselben Tabelle
  sind.
- **Die Kennung wird nirgends gefiltert, gruppiert oder aggregiert — nur angezeigt.** Nachgeprüft an
  allen Filterpfaden: `journalEintraege` baut `conds` aus `typ`, `von`, `bis` und dem Suchbegriff
  (`queries.ts:91-103`), **kein** `quelle_id`; `checkHistorie` aus `fahrzeugId`, `von`, `bis`
  (`:352-355`), ebenfalls nicht. `quelleId` erscheint ausschließlich in Projektionen (`:69`,
  `:119-120`, `:506`). **Es gibt im Modul keine Auswertung „was hat Person X gebucht"**, die durch
  einen gespaltenen Kennungsraum halbiert würde. Genau das wäre der einzige Grund für eine
  Zuordnungstabelle gewesen.
- **Bei Gleichheit der `sub`-Werte fällt der ganze Weg zur Nulloperation zusammen** — nicht per
  Sonderfall, sondern **per Identität**: der erste Suite-Login trifft dann exakt die importierte
  Zeile und aktualisiert sie per `onConflictDoUpdate`. Eine leere Zuordnungstabelle wäre die
  schlechtere Nulloperation, weil sie trotzdem gepflegt, migriert und gelesen werden müsste.
- **Und sie wäre unwiderruflich falsch, wenn sie falsch wäre.** Eine im Import angewandte Umschreibung
  von `quelle_id` schriebe in Zeilen, die danach per Trigger nie wieder änderbar sind (§4.4).

**Der sichtbare Preis, ausgeschrieben — und er tritt nach der Messung (Befund 2) NICHT ein; er bleibt
hier als der Zustand stehen, gegen den der Entwurf robust ist:** bei ungleichen `sub`-Werten trüge
`users` für eine Person **zwei** Zeilen, mit demselben Namen und derselben E-Mail. Für die Anzeige ist das folgenlos —
**vorausgesetzt, die neue Zeile hat einen Namen bekommen**; sonst greift der Defektzustand aus (i).
Es gibt keinen `UNIQUE`-Index auf `email`, und es kommt keiner dazu — er würde den zweiten Login zum
Fehler machen. Die Verwaltung darf die Zeilenzahl der Tabelle nirgends als Personenzahl präsentieren.

⚠️ **Annahme:** dass jede Person, deren Alt-Kennung im Journal steht, sich nach dem Cutover mindestens
einmal an der Suite anmeldet, ist **nicht** vorausgesetzt — die historischen Namen stehen unabhängig
davon in der importierten Zeile. Ohne Anmeldung fehlt lediglich die neue Zeile, und die braucht erst,
wer nach dem Cutover bucht.

---

### 4.14 Fremdschlüssel, Einfügereihenfolge, Waisen und Indizes

**Der Fremdschlüsselgraph ist ein DAG — mit einer Kante, die rückwärts aussieht.**
`lagerorte.template_id` → `fahrzeug_templates.id` (`schema.ts:15`) lässt die zentrale Tabelle von einer
später hinzugefügten abhängen. Eine tragfähige Einfügereihenfolge, verbindlich für jeden Importer und
jede Fixture:

```
artikel
→ fahrzeug_templates
→ template_positionen        (artikel, fahrzeug_templates)
→ lagerorte                  (fahrzeug_templates)
→ chargen                    (artikel)
→ soll_positionen            (lagerorte, artikel, template_positionen)
→ buchungen · checks · lagerort_verfall
→ bz_geraete · o2_flaschen · geraete
→ bz_kontrollen · o2_messungen
→ tokens                     (lagerorte)
→ users                      (keine FK)
```

**Zweite Abhilfe, selbst gemessen an `better-sqlite3` ^12.11.1** (drei Läufe, alle drei
nachgestellt):

| Lauf | Ergebnis |
|---|---|
| Kind vor Elternteil, **ohne** `defer` | `FOREIGN KEY constraint failed` **beim INSERT** |
| Kind vor Elternteil, **mit** `defer` innerhalb der Transaktion | läuft durch, Zeile steht |
| echter Waisenwert, **mit** `defer` | `FOREIGN KEY constraint failed` **beim COMMIT** |

⚠️ **Zwei gemessene Eigenschaften begrenzen den Griff.** Erstens verschiebt er den Fehler vom
`INSERT` auf den `COMMIT` — die Meldung nennt dann **keine Zeile**, und ein Importer, der sie
unverändert weiterreicht, liefert einen unbrauchbaren Befund. Zweitens ist der Wert
**transaktionslokal**: nach dem `COMMIT` steht `defer_foreign_keys` gemessen wieder auf `0`. Ein
Importer, der **eine Transaktion je Tabelle** öffnet, hat davon also gar nichts — er muss das Pragma
in jeder einzelnen setzen oder alles in **eine** Transaktion klammern. Die Einfügereihenfolge oben
bleibt damit die tragende Zusage; das Pragma ist das Netz darunter, nicht ihr Ersatz.

**Waisen, die es geben kann — und was mit ihnen geschieht:**

| Bezug | Fremdschlüssel? | Waisenrisiko | Behandlung |
|---|---|---|---|
| `buchungen.artikel_id/charge_id/lagerort_id` | **ja**, alle drei | keines — `foreign_keys = ON` in beiden Welten | — |
| `tokens.ziel_id` | **nein** (polymorph) | **ja**: zeigt auf eine gelöschte `lagerorte.id`/`artikel.id` | ⚠️ **Runbook-Eingabe:** vor dem Cutover prüfen, ob jedes `ziel_id` mit `ziel_typ='fahrzeug'` in `lagerorte` und jedes mit `'artikel'` in `artikel` auflöst. Treffer sind laminierte Kärtchen, die ins Leere zeigen; sie werden gesperrt, nicht importiert-und-vergessen |
| `checks.ergebnis` → Geräte/Flaschen/Artikel | **nein** (freies JSON) | **ja**, ausdrücklich toleriert | beide Leser überbrücken („(gelöschter Artikel)") — 1:1 |
| `buchungen.referenz` → `checks.id` | **nein** (Textpräfix) | **ja** | 1:1; es gab nie eine Zusage |
| `users.id` ← `quelle_id` | **nein** | **ja**, in beide Richtungen | §4.13; die Anzeige fällt auf die rohe ID zurück (`quelle.ts:24`) |
| `tokens.scope_lagerort_id` | **ja** | in Produktion vermutlich durchweg `NULL` | §4.12 |

**Indizes — alle bestehenden bleiben, vier kommen dazu.** Kein Index wird entfernt, auch kein
redundanter: eine gestrichene Zeile im Index-Set ist eine Abweichung, die der Schema-Diff aus §4.3
melden würde, und der Nutzen wäre eine minimal schnellere Schreiboperation.

| Index | Spalten | Status | Begründung |
|---|---|---|---|
| `idx_buchungen_artikel` | `(artikel_id)` | 1:1 | `schema.ts:105` |
| `idx_buchungen_charge` | `(charge_id)` | 1:1 | `:106` |
| `idx_buchungen_ts` | `(ts)` | 1:1 | `:107` |
| `idx_chargen_artikel_verfall` | `(artikel_id, verfall)` | 1:1 | `:64` |
| `idx_soll_fahrzeug` | `(fahrzeug_id)` | 1:1 | `:129` |
| `idx_template_pos_template` | `(template_id)` | 1:1 | `:41` |
| `idx_lagerort_verfall_ort_artikel` | `(lagerort_id, artikel_id)` **UNIQUE** | 1:1 | `:86` |
| `idx_bz_geraete_lagerort` | `(lagerort_id)` | 1:1 | `:189` |
| `idx_bz_kontrollen_geraet_ts` | `(geraet_id, ts)` | 1:1 | `:215` |
| `idx_o2_flaschen_lagerort` | `(lagerort_id)` | 1:1 | `:231` |
| `idx_o2_messungen_flasche_ts` | `(flasche_id, ts)` | 1:1 | `:245` |
| `idx_geraete_lagerort` | `(lagerort_id)` | 1:1 | `:275` |
| `tokens_code_unique` | `(code)` **UNIQUE** | 1:1 | `0000:85` |
| `bz_geraete_barcode_unique` | `(barcode)` **UNIQUE** | 1:1 | `0002:18` |
| `geraete_barcode_unique` | `(barcode)` **UNIQUE** | 1:1 | `0005:16` |
| **`idx_buchungen_ts_id`** | `(ts, id)` | **neu (S3)** | deterministische Journalsortierung (Falle 3, §4.9, §5.14.4); macht ein späteres Keyset-Nachladen zur Query-Änderung statt zur Migration |
| **`idx_buchungen_lagerort_artikel`** | `(lagerort_id, artikel_id)` | **neu (S3)** | trägt `bestandJeArtikel(db, lagerortId)` und `restJeCharge` aus §5.2.4 — die Abfragen filtern auf **einen** Lagerort und gruppieren nach Artikel bzw. Charge. Ohne ihn ist das ein Full-Scan |
| **`idx_buchungen_artikel_lagerort_charge`** | `(artikel_id, lagerort_id, charge_id)` | **neu (S3)** | deckend für `restJeChargeFuerArtikel(db, artikelId, lagerortId)` — den Lesepfad des Schreibwegs (FEFO, Korrektur), der mit **artikel_id** führend filtert |
| **`idx_checks_fahrzeug_completed`** | `(fahrzeug_id, completed_at)` | **neu (S3)** | `checkHistorie` filtert genau danach und sortiert nach `completed_at` (`queries.ts:352-361`); `checks` hat heute **keinen einzigen** Index außer dem PK |

⚠️ **Die beiden Buchungs-Indizes aus S3 sind nicht redundant zueinander** — sie unterscheiden sich in der
führenden Spalte, und genau daran entscheidet SQLite, ob ein Index für eine `WHERE`-Klausel taugt.
`idx_buchungen_lagerort_artikel` bedient die Leseseite (ein Lagerort, alle Artikel),
`idx_buchungen_artikel_lagerort_charge` die Schreibseite (ein Artikel, ein Lagerort, je Charge).

⚠️ **Was diese Indizes NICHT leisten:** sie beheben Falle 10 nicht. Die Leseseite skaliert mit der
Journallänge, nicht mit dem Artikelstamm, und weil nie etwas gelöscht wird, wächst das monoton. Die
Behebung ist die aggregierende Query aus Entscheidung 7 (b) (§5.2.4), nicht der Index — der Index
macht sie nur möglich. ⚠️ **Runbook-Eingabe:** Zeilenzahlen je Tabelle und die älteste `buchungen.ts`
aus der produktiven Datei (Betreiberfrage 9). Ohne sie ist kein Performance-Budget setzbar und die
Dauer des Wartungsfensters geraten.

---

### 4.15 Die Konstanten und die zwei Suite-Fallen, die dieses Kapitel berührt

Dieses Kapitel legt ein Dutzend Werte fest, die **Server Components** lesen müssen — Ampelgrenzen,
Sentinels, Enums, Regexes, die Zeitzone. In der Suite entscheidet sich an dieser Stelle, ob eine Seite
läuft oder mit HTTP 500 antwortet, und **kein Gate findet den Fehler**.

**Falle 6 — ein `WERT` aus einem `"use client"`-Modul kommt in einer Server Component nicht an.**
Sie bekommt eine Client-Referenz statt des Wertes, und die ganze Seite antwortet mit 500. TypeScript
ist zufrieden, `pnpm build` findet nichts, und **Vitest kann es strukturell nicht sehen** — dort ist
`"use client"` ein wirkungsloser String. Genau in diese Falle zeigt der Bestand: `ZUSTAENDE` steht
heute in `CheckFlow.tsx:22`, einer Client-Datei. **Verbindlich: alle folgenden Werte leben in Modulen
unter `_lib/` OHNE `"use client"`**, und Client-Komponenten importieren sie von dort (das ist die
erlaubte Richtung):

| Wert | Zielort | heute |
|---|---|---|
| `HANDLAGER_ID = "handlager"` | `_lib/konstanten.ts` | `src/db/seed-handlager.ts:4` (Servermodul, ok) |
| `PSEUDO_VERFALL = "2099-12"`, `istOhneVerfall()` und die drei `chargenNr`-Literale | `_lib/konstanten.ts` | dreimal inline (`korrektur.ts:33`, `inventur.ts:42`, `csv.ts:31`) |
| `ZUSTAENDE = ["In Ordnung","Gebrauchsspuren","Defekt"]`, `ZUSTAND_DEFEKT` | `_lib/konstanten.ts` | ⚠️ `CheckFlow.tsx:22` — **Client-Datei** |
| `BUCHUNGSTYPEN`, `QUELLE_TYPEN`, `LAGERORT_TYPEN`, `GERAETE_TYPEN`, `TOKEN_ZIEL_TYPEN` | `_db/schema.ts` (Drizzle-Enum) + `_lib/konstanten.ts` (Zod) | inline im Schema |
| `MONAT_REGEX` | `_lib/konstanten.ts` — **der einzige Monatsvalidator des Moduls** | `src/db/lagerort-verfall.ts:10` (Servermodul, ok) |
| `ZEITZONE` und die sieben Zeitfunktionen | `_lib/zeit.ts` | existiert nicht |
| `MTK_WARN_TAGE = 30`, `OBJEKT_ABLAUF_WARN_TAGE = 30` | `_lib/domain/geraet.ts` | `src/lib/domain/geraet.ts:4-5` (ok) |
| `JOURNAL_GRENZE`, `CHECK_GRENZE`, `BZ_LOGBUCH_GRENZE` | `_lib/grenzen.ts` (§10.3) | Vorgabewerte in `queries.ts:87,350`, `db/bz.ts:124` |

**Falle 7 — `@ant-design/icons` in einer Server Component ergibt HTTP 500, und `"use client"` behebt
das nicht, es macht es still.** Sie berührt dieses Kapitel nur an einer Stelle, und die ist eine
Verbotszeile: **kein Modul unter `_lib/` und `_db/` importiert je ein Icon.** Der nackte Spezifizierer
löst über `exports["."].node.import` auf CJS auf, das `createContext` auf **Modulebene** ruft — der
Fehler entsteht **beim Import, nicht beim Rendern**, und reißt jede Datei mit, die die Konstanten
importiert. `src/core/shell/icons.test.ts` riegelt das repo-weit ab; geht der Test rot, liegt die
Ursache fast nie in `core/shell`, sondern in der Datei, die die Fehlermeldung nennt. Die Zuordnung
Ampel → Symbol gehört in eine Client-Insel oder in ein Inline-SVG (§7.7.4), nie neben einen Datenwert.

⚠️ **Die beiden Fallen sind gegenläufig und dürfen nicht zusammengelegt werden.** Setzt man
`"use client"` auf ein Konstantenmodul, um Falle 7 zu „lösen", verwandelt man sie in Falle 6:
HTTP 200 mit leerer Map, und der Rückfall trägt still den falschen Wert. Laut ist besser als still.

---

### 4.16 Testaufbau — wer welche Aussage über das Datenmodell besitzt

Drei Dateien mit klar getrennten Zuständigkeiten — dazu fünf Aussagen über Ableitungen, die je bei
ihrem Eigentümer stehen (Punkt 4). Keine Aussage steht an zwei Orten. Die drei Ebenen
und die suiteweiten Randbedingungen stehen in §12.

**1. `_db/migrations.test.ts` — „das Schema ist das, was §4 behauptet."**
Baut eine temporäre **Datei**-DB (nicht `:memory:` — nur der Dateiweg belegt, dass `migrate()` auf einer
frisch angelegten Datei durchläuft), setzt `foreign_keys = ON`, spielt `migrate()` gegen
`src/app/m/lagerbuch/_db/migrations` ab. Vorbild Zeile für Zeile: `m/files/_db/migrations.test.ts:1-40`.
Behauptungen:

- **16 Tabellen**, je Tabelle Spaltennamen, `type`, `notnull`, `dflt_value` aus `PRAGMA table_info`.
- **Die Indexliste** je Tabelle aus `PRAGMA index_list`, einschließlich `unique`-Flag und der **vier**
  neuen Indizes aus §4.14.
- **Die Zeitstempel-Einheit als Rohwert.** Ein bekanntes Datum einfügen und den **rohen**
  Spaltenwert lesen: zehnstellig, nicht dreizehnstellig. Das ist der einzige Test, der die
  1000er-Falle sehen kann — jede Prüfung, die über `mode: "timestamp"` schreibt **und** liest, ist
  gegen sie blind, weil beide Richtungen dieselbe Umrechnung fahren.
- **Die Handlager-Zeile existiert** nach der Migration, mit `id='handlager'`, `typ='lager'`, `aktiv=1`.
- **`foreign_keys` beißt wirklich**: ein Insert in `buchungen` mit erfundener `artikel_id` wirft.
  (Ohne das Pragma wäre die ganze Datei grün, ohne etwas zu prüfen.)

**2. `_db/append-only.test.ts` — „die Trigger sind da, und sie sind es aus der Migration."**
Portierung von `lagerbuch/src/db/append-only.test.ts:19-37`, mit **einer** entscheidenden Änderung: die
Test-DB entsteht durch **Abspielen der Migrationen**, nicht durch einen Schema-Push. Das war im
Alt-Repo bereits so (`src/db/testing.ts:10` → `applyMigrations` → `MIGRATIONS_FOLDER = "./drizzle"`,
`src/db/index.ts:42-46`) und ist die einzige Eigenschaft, wegen der der Test überhaupt greift. Ein
schema-gepushter Aufbau macht ihn grün und **inhaltsleer**. Behauptungen:

- `INSERT` in `buchungen` läuft.
- `UPDATE buchungen` wirft `/append-only/`.
- `DELETE buchungen` wirft `/append-only/`.
- **neu (S2):** dasselbe Tripel für `bz_kontrollen`.
- **neu:** `o2_messungen` erlaubt `UPDATE` und `DELETE` — die bewusste Gegenprobe zu Entscheidung 5
  (c). Ohne diesen Test ist der Unterschied zwischen „bewusst offen gelassen" und „vergessen" nicht
  lesbar.
- **neu:** `INSERT OR REPLACE INTO buchungen …` **umgeht** den Trigger beim Default
  `recursive_triggers = 0`. Der Test hält die gemessene Tatsache fest, statt sie zu beklagen — er ist
  der Grund, warum das Import-Kapitel `INSERT OR IGNORE` vorschreibt, und er wird rot, falls eine
  spätere SQLite-Fassung das ändert.

Die Suite hat heute **keinen einzigen** Test, der SQLite-Trigger anfasst (Falle 1). Diese Datei ist
der erste.

**3. `_lib/zeit.test.ts` — „die Zone steht im Code, nicht in der Umgebung."**
Der Test setzt `process.env.TZ` **absichtlich** auf `UTC` **und** auf `Pacific/Kiritimati` (UTC+14, um
Vorzeichenfehler zu finden) und behauptet in beiden Läufen dieselben Ergebnisse:

- `monatsEnde("2026-08")` = `2026-08-31T21:59:59.999Z` (Sommerzeit, UTC+2).
- `monatsEnde("2026-01")` = `2026-01-31T22:59:59.999Z` (Winterzeit, UTC+1) — der Test, der beweist,
  dass kein fester Offset verdrahtet wurde.
- `heuteIso(new Date("2026-08-03T22:30:00Z"))` = `"2026-08-04"` — der Fall, in dem UTC und Berlin
  verschiedene Tage haben; er nagelt den Excel-Dateinamen fest.
- `fmtTs(new Date("2026-08-02T23:30:00Z"))` = `"03.08. 01:30"` — genau der Fall, den Falle 2 als
  eigentlichen Schaden benennt (unter UTC stünde dort „02.08. 23:30", jede Buchung zwischen 00:00 und
  02:00 landete auf dem Vortag).
- Die zwei DST-Ränder aus §4.5 (Sprungloch und Doppeldeutigkeit) mit dem dort festgelegten Ausgang.

**Dieser Test ist zugleich die Begründung dafür, dass `iuk-suite/vitest.config.ts` KEINEN globalen
`TZ`-Block bekommt** (§12.6, Punkt 1): er beweist die Unabhängigkeit, die ein Pin verstecken würde.

**4. „Die Ableitungen stimmen." (Fachlichkeit, nicht Struktur.)**
Portierung der bestehenden Domänentests. ⚠️ **Es gibt kein `_db/queries.test.ts`** — nach der Regel
aus §2.1 h hält `_db/` keinen Lesepfad, und die Dateien, die gegen eine echte SQLite-Datei laufen,
sind in §5.19.2 einzeln benannt. Die folgenden fünf Aussagen fehlen im Alt-Repo oder sind zu schwach;
jede gehört genau einer vorhandenen Datei:

| Aussage | Eigentümer |
|---|---|
| Der Fahrzeug-Check prüft die entstandenen **Buchungen** | `_db/check-abschluss.test.ts` (§5.19.2) |
| `verfallStatus` gegen die Sentinels | `_lib/domain/verfall.test.ts` (§5.19.1) |
| `parseCheckErgebnis` gegen beide Formate | `_lib/checkErgebnis.test.ts` |
| `quelleAufloeser` mit beiden Kennungsräumen **und** der Defektzustand aus §4.13 (i) | `_db/quelle.test.ts` — §3.8.1 verweist bereits hierher |
| Die `merkeNutzer`-Gegenprobe (INSERT schreibt, UPDATE überschreibt keinen Namen mit `null`) | `_db/quelle.test.ts` |

Im Einzelnen:

- **Der Fahrzeug-Check prüft die entstandenen BUCHUNGEN.** `check.test.ts:63-71` behauptet heute nur
  den Bestand (`expect(bestandProLagerort(r, fz)).toBe(4)`); niemand prüft, welche Zeilen dabei
  entstanden sind — Typ, Vorzeichen, `referenz`-Präfix, Charge. Das ist die benannte Lücke aus
  Falle 12 der widerlegten Rohbefunde, und sie schließt sich hier (Details §5.19.2).
- **`verfallStatus` gegen die Sentinels:** `"2099-12"` ist grün, und ein Wert außerhalb `01`–`12`
  wird als abgelaufen geführt (der dokumentierte, nicht behobene Ausgang von §4.6).
- **`parseCheckErgebnis` gegen beide Formate**, einschließlich unlesbarem JSON → leeres V2.
- **`quelleAufloeser` mit beiden Kennungsräumen nebeneinander** (§4.13): eine Zeile mit Alt-`sub`
  und eine mit Neu-`sub`, beide lösen auf, und eine unbekannte Kennung fällt auf die rohe ID zurück.
- **Der Defektzustand aus §4.13 (i) ist als Erwartung ausgeschrieben:** eine `users`-Zeile mit
  `name = null` **und** `email = null` löst auf die **rohe Kennung** auf. Der Test behauptet genau das
  — er verhindert den Zustand nicht, er macht ihn benannt und auffindbar, statt ihn als „unerklärliche
  UUID im Journal" wiederzuentdecken. Dazu die Gegenprobe: `merkeNutzer` schreibt beim **INSERT** die
  mitgelieferten Werte, überschreibt beim **UPDATE** aber keinen vorhandenen Namen mit `null`.

**Was strukturell KEIN Test dieses Kapitels leisten kann** — und deshalb ins Runbook gehört: dass die
`COPY`-Zeile im Dockerfile existiert (§2.2), dass die produktiven `verfall`-Werte im Bereich liegen
(§4.6), dass der `sub` übereinstimmt (§4.13) und dass `tokens.ziel_id` überall auflöst (§4.14). Alle
vier sind Aussagen über Daten oder Images, die nicht im Repo stehen.

---

### 4.17 Verworfene Alternativen

Die vollständige Liste steht in §13; hier nur die, die ausschließlich das Datenmodell betreffen.

| Alternative | Warum sie naheliegt | Warum sie verworfen ist |
|---|---|---|
| **Materialisierte Bestandsspalte** (Entscheidung 7 c) | die rekonstruktive Rechnung ist O(Journal) je Seitenaufruf | zweiter Wahrheitsspeicher; widerspricht der tragenden Leitplanke des Moduls (`implementierungsplan.md:87`). Die aggregierende SQL-Abfrage (b) löst dasselbe Problem verhaltensneutral (§5.2.4) |
| **Migrationsverzeichnis wörtlich kopieren** (Entscheidung 4 i, Variante 2) | die Trigger überleben garantiert, kein Schema-Diff nötig | bricht mit dem Hausstil aller vier portierten Module und lässt keinen Platz für die Handlager-Migration; die Beweispflicht ist mit dem Schema-Diff aus §4.3 billiger als der Bruch |
| **`lagerbuch.db` als Datei kopieren** (Entscheidung 4 ii, Variante 1) | vermeidet jede Feldzuordnung — und damit die Fehlerklasse, die ein Paritätscheck nicht sieht | die kopierte Datei trüge lagerbuchs `__drizzle_migrations` mit sieben Einträgen gegen neu gestempelte Migrationen: **Startabbruch der ganzen Suite**. Kein Datenverlust (`dialect.cjs:677,694` klammert in BEGIN/ROLLBACK), aber ein Ausfall aller fünf Module |
| **`CHECK`-Constraint auf die Monatsfelder** (Entscheidung 6 b) | macht `"2026-00"` strukturell unmöglich | ein Import, der an Daten scheitert, die nicht im Repo stehen; SQLite kann ihn nicht nachträglich hinzufügen, es bräuchte den Neubau einer FK-referenzierten Tabelle während des Cutovers. Und er schützt das Falsche: empfindlich ist `verfallStatus`, nicht die FEFO-Sortierung |
| **`UNIQUE (artikel_id, chargen_nr, verfall)`** | verhindert gespaltene FEFO-Töpfe | dasselbe Argument, plus: zwei Lieferungen mit derselben aufgedruckten Chargennummer sind ein realer Vorgang, der Schaden ist auf die Reihenfolge zwischen zwei Töpfen mit identischem Verfall begrenzt — und genau die legt §5.3.1 ohne Migration fest |
| **Zuordnungstabelle `alt_sub → neu_sub`** (17. Tabelle) | scheint bei ungleichen `sub`-Werten unvermeidlich | nachgeprüft unnötig: die Kennung wird nirgends gefiltert oder gruppiert (`queries.ts:91-103`, `:352-355`), nur angezeigt; beide Kennungsräume dürfen als Primärschlüssel derselben Tabelle koexistieren, und bei Gleichheit fällt der Weg **per Identität** zur Nulloperation zusammen (§4.13) |
| **`users` beim Import leeren** (Entscheidung 27 a, die Empfehlung) | einfach, kein Ratewerk, sichtbarer Zwischenzustand | die gefilterte Übernahme ist genauso ratewerkfrei (Mengenzugehörigkeit statt E-Mail-Abgleich) und macht das historische Journal nicht namenlos — was bei ungleichen `sub`-Werten **nie** heilen würde. Fällt auf (a) zurück, wenn das Prädikat nichts liefert |
| **Trigger auch auf `o2_messungen`** (Entscheidung 5 b) | symmetrisch, „beweisfeste Logbücher" | zementiert genau die Zeilen aus Falle 8: ein durchgeklickter Sauerstoff-Schritt schreibt je Flasche den Nennfülldruck als Messwert. Sie sehen plausibel aus, zählen in `flaschenAuffaellig` und fallen in keinen „nicht bewertbar"-Zweig (§5.12) — Unwiderruflichkeit ist dort das Gegenteil dessen, was man braucht |
| **Trigger auf `checks`** | `checks.ergebnis` ist der Geräte-Nachweis | `completed_at` ist nullbar — das Schema sieht den offenen, später abzuschließenden Check ausdrücklich vor. Ein `UPDATE`-Trigger versperrte diese Bauform für immer |
| **`tokens.scope_lagerort_id` streichen** | belegt tot: kein Schreiber, ein einziger (falscher) Leser | „kein Produktionspfad schreibt sie" ist eine **Code**-Aussage; die produktive Tabelle steht nicht im Repo. Eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich. Sie bleibt, der Löschzähler wechselt auf `ziel_id` |
| **Prozess-`TZ` als Zonenquelle** (Entscheidung 26 a) | eine `.env`-Zeile, gemessen wirksam auf Alpine | das Setzen ist ein suiteweiter Eingriff gegen vier laufende Module und **ausdrücklich nicht Teil dieser Spec**. Ein Modul, das darauf baut, hängt an einem Schritt, den diese Spec nicht schuldet |
| **`timestamp_ms` statt `timestamp`** | `m/qr/_db/schema.ts:19-20` macht es so | 16 Spalten würden um Faktor 1000 verschoben, und **der Paritätscheck bliebe grün**, weil beide Arme dieselbe Umrechnung fahren (1:1-Pflicht 7) |
---

## 5. Fachlogik und Invarianten

Dieses Kapitel schreibt die Regeln aus, die das Modul hält — so, dass jemand sie ohne Blick in
`lagerbuch` neu implementieren kann. Es entscheidet dabei acht Punkte aus Kapitel 6 der Analyse
(1, 2, 3, 5, 6, 7, 8, 35), führt vier Regeln nach, die heute nur im Client stehen, und erzeugt drei
neue Runbook-Prüfungen. Was es **nicht** entscheidet: Schemaübertrag und Migrationsstrategie (§4),
Auth (§3), Rate-Limit-Adresse (§3.5), Oberflächenaufbau (§6, §7). Wo eine Regel davon abhängt, steht
sie hier trotzdem — mit einer benannten Schnittstelle.

---

### 5.1 Wo die Fachlogik liegt — und warum das eine Falle berührt

Die reinen Funktionen wandern 1:1 in Module **ohne `"use client"`**:

```
src/app/m/lagerbuch/
  _lib/
    domain/bestand.ts      bestand · bestandProCharge · bestandProLagerort · bestandProLagerortUndCharge
    domain/fefo.ts         fefoVerteilung
    domain/verfall.ts      Ampel · verfallStatus
    domain/vorschlag.ts    braucht · vorschlagsmenge
    domain/o2.ts           fuellstandProzent · o2Status
    domain/geraet.ts       datumFaelligkeit · mtkFaelligkeit · objektAblauf · geraetFaelligkeit
                           MTK_WARN_TAGE=30 · OBJEKT_ABLAUF_WARN_TAGE=30
    domain/bz.ts           bzFaelligkeit · imBereich · bewerteKontrolle · akkuLebensdauer
                           BZ_KONTROLL_INTERVALL_TAGE=31 · BZ_WARN_TAGE=5
    domain/check.ts        fehlmengen · summiereCheckErgebnis
    konstanten.ts          HANDLAGER_ID · PSEUDO_VERFALL · istOhneVerfall · ZUSTAENDE ·
                           ZUSTAND_DEFEKT · MONAT_REGEX · die fünf Enum-Wertelisten
    grenzen.ts             JOURNAL_GRENZE · CHECK_GRENZE · BZ_LOGBUCH_GRENZE + die Env-Zahlen (§10.3)
    zeit.ts                ZEITZONE + die sieben Zonenfunktionen (§4.5)
    ampel.ts               Ampelpalette (fachsemantisch, modul-eigen)
    suche.ts               falte
    format.ts              fmtVerfall · chargeText · geraetFaelligChip · ampelTon · typLabel ·
                           zeitraumAus   (fmtTs und tagesGrenzen liegen in zeit.ts, §4.5)
    checkErgebnis.ts       parseCheckErgebnis (§4.10)
    artikelFilter.ts  journalZeile.ts  checkNutzlast.ts  bestandExportSpalten.ts
    lesepfade/             artikel.ts · journal.ts · verfall.ts · fahrzeuge.ts · checks.ts ·
                           bestellung.ts · bz.ts · o2.ts · geraete.ts · bestand.ts
    schreibpfade/          abbuchung.ts · umlagerung.ts · korrektur.ts · lagerortVerfall.ts ·
                           templateSync.ts
  _db/
    client.ts              getDb() — modul-eigener Opener, registriert `lb_falte` (§5.13.2)
    quelle.ts              quelleAufloeser
```

**`CLAUDE.md`-Falle 6 trifft dieses Kapitel mit voller Wucht.** Vier Werte, die heute in
`"use client"`-Dateien leben, werden hier zu geteilten Konstanten, die eine **Server Component** liest:

| Wert | heute | Leser im Zielmodul |
|---|---|---|
| `ZUSTAENDE = ["In Ordnung","Gebrauchsspuren","Defekt"]` | `src/app/helfer/check/CheckFlow.tsx:22` (`"use client"`) | zod-Enum in der Check-Action (Server), Auswertung in Übersicht/Detail (Server) |
| `JOURNAL_GRENZE = 100` | Vorgabewert in `src/db/queries.ts:87`, Text in `journal/page.tsx:32` | Query (Server) **und** die Deckel-Meldung (Server) |
| `CHECK_GRENZE = 50` | `src/db/queries.ts:350` | dito |
| `PSEUDO_VERFALL = "2099-12"` | dreimal literal (`inventur.ts:42`, `korrektur.ts:33`, `csv.ts:31`) | Lese- und Schreibpfade, beide Server |

Liegen diese Werte in einer Datei mit `"use client"`, bekommt die Server Component eine
Client-Referenz statt des Wertes — HTTP 500 für die ganze Seite, `typecheck` und `pnpm build` bleiben
grün, und **Vitest kann es strukturell nicht sehen** (dort ist `"use client"` ein wirkungsloser
String). Deshalb: `_lib/konstanten.ts` und `_lib/grenzen.ts` tragen **kein** `"use client"`; die
Client-Inseln importieren von dort, nie umgekehrt.

Zweite Falle desselben Kapitels: `_lib/format.ts` liefert nur **Text und Tonnamen**, nie JSX und nie
Icons. `@ant-design/icons` in einer Server Component ergibt HTTP 500 schon beim Import
(`CLAUDE.md`-Falle 7), und `"use client"` auf `format.ts` verwandelte Falle 7 in Falle 6. Jede
Ampel-Darstellung ist damit eine Client-Insel oder ein Inline-SVG (§7.7.4); die **Entscheidung**
darüber, welche Farbe gilt, fällt hier serverseitig als reiner Wert.

---

### 5.2 Bestandsrechnung — rekonstruktiv, und was das kostet

#### 5.2.1 Die Rechnung

Es gibt **keinen zweiten Wahrheitsspeicher**. `chargen` trägt keine Menge
(`src/db/schema.ts:55-65`); jeder Bestand ist die Summe vorzeichenbehafteter Buchungsmengen
(`src/db/schema.ts:98`: „signed: zugang +, entnahme −"). Vier Begriffe, alle in
`src/lib/domain/bestand.ts`:

| Funktion | Zeile | Bedeutung |
|---|---|---|
| `bestand(rows)` | `:1-3` | Summe über eine bereits gefilterte Zeilenmenge — der schwächste Begriff, in `queries.ts` **nirgends** benutzt |
| `bestandProCharge(rows)` | `:5-11` | Rest je `chargeId`, **ohne** Lagerortbezug — einziger Aufrufer `queries.ts:31`, und der filtert vorher selbst auf einen Lagerort |
| `bestandProLagerort(rows, lagerortId)` | `:15-20` | Bestand **eines** Lagerorts |
| `bestandProLagerortUndCharge(rows, lagerortId)` | `:25-35` | Rest je Charge **an einem** Lagerort |

Die beiden lagerort-gescopten Funktionen sind die tragenden. Ihre Begründung steht im Quelltext und
ist eine Invariante, kein Kommentar: „Sobald Fahrzeuge eigene Buchungen tragen, darf keine
Handlager-Ansicht mehr blind über alle Lagerorte summieren" (`bestand.ts:13-14`) und „Kern-Fix gegen
Phantombestand: FEFO/Aussonderung/Inventur dürfen nicht die gleiche chargeId aus einem anderen
Lagerort mitzählen" (`:22-24`).

**Verbindliche Bezugsgrößen — was welche Ansicht summiert:**

| Ansicht / Rechnung | Lagerort | Beleg |
|---|---|---|
| Artikelliste (Verwaltung) | Handlager | `queries.ts:53` |
| Artikel-Detail, Bestandszahl | Handlager | `queries.ts:67` |
| Artikel-Detail, Buchungsverlauf | **alle** (zeigt Umlagerungen als Aktivität) | `queries.ts:62`, Begründung `:65-66` |
| Kennzahl „unter Mindestbestand" | Handlager | `queries.ts:138` |
| Verfall-KPI und Verfallsliste | Handlager, je Charge | `queries.ts:132`, `:195-198` |
| Bestellvorschlag | Handlager | `queries.ts:519` |
| Fahrzeug „Artikel unter Soll" | das Fahrzeug | `queries.ts:297` |
| Soll-Zeile: `fahrzeugBestand` / `handlagerBestand` | Fahrzeug / Handlager | `queries.ts:334-335` |
| Inventur-Differenz | Handlager | `inventur.ts:29` |
| Aussondern-Rest | Handlager, je Charge | `aussondern.ts:33-36` |
| FEFO-Abbuchung | Parameter, Vorgabe Handlager | `abbuchung.ts:36`, `:39-42` |

Diese Tabelle ist **normativ**. Jede Abweichung im Zielmodul ist ein Verhaltensbruch, den kein Gate
findet: Handlager- und Fahrzeugbestand unterscheiden sich erst, wenn tatsächlich umgelagert wurde,
und in einer frisch migrierten Test-DB nie.

#### 5.2.2 Invarianten

**I1 — Append-only.** `buchungen` kennt kein `UPDATE` und kein `DELETE`; das erzwingen zwei
BEFORE-Trigger aus handgeschriebenem SQL (`drizzle/0001_append_only.sql:1-11`), die
`schema.ts:89-109` nirgends deklariert. Korrekturen sind **neue Zeilen mit `typ = "korrektur"`**,
nie Änderungen. Die Trigger sind Gegenstand von §4.3/§4.4 und damit nicht dieses Kapitels —
**fachlich sind sie aber die Voraussetzung für jede Aussage hier**, und deshalb gilt: geht der
Trigger verloren, gilt keine der Regeln dieses Kapitels mehr.

**I2 — Bestand wird nie negativ.** Jeder Abgang läuft über `fefoAbbuchung`
(`abbuchung.ts:24-55`), das an der Verfügbarkeit **an diesem Lagerort** kappt
(`fefo.ts:7-18` liefert höchstens die Summe der Reste); `aussondern` bucht exakt `-rest`
(`aussondern.ts:37-42`); `korrekturAufLagerort` mit `diff < 0` läuft ebenfalls über FEFO
(`korrektur.ts:23`). Positiv gebucht wird ohne Grenze. Es gibt **keinen** Produktivpfad, der eine
Zeile schreibt, die den Lagerortbestand unter 0 drücken könnte. Diese Invariante ist testpflichtig
(§5.19), weil sie durch eine einzige unvorsichtige Direktbuchung fiele.

**I3 — Umlagerung ist netto null.** `umlagerung` (`umlagerung.ts:10-35`) bucht das Ziel-Leg
**strikt aus `teile[]`**, also aus der tatsächlich gebuchten Verteilung, nie aus der gewünschten
Menge (`:26-27`). Beide Legs tragen `typ = "umlagerung"`, damit Reporting und Bestellvorschlag eine
interne Verschiebung nicht als Wareneingang oder Verbrauch missverstehen (`:8-9`). Die `chargeId`
bleibt erhalten — die Verfall-Provenienz wandert mit.

**I4 — Nach `korrekturAufLagerort(…, istMenge)` gilt
`bestandProLagerort(…, lagerortId) === istMenge`.** So steht es als Zusage im Quelltext
(`korrektur.ts:12`) und so wird es benutzt: der Fahrzeug-Check setzt den Fahrzeugbestand je Artikel
auf die Summe der gezählten Ist (`check.ts:107-110`).

**I5 — Der Zugang darf keine artikelfremde Charge treffen.** `bucheZugang` prüft bei bestehender
Charge, dass sie zum Artikel gehört (`buchung.ts:33-36`), sonst entstünde „phantom, un-withdrawable
Bestand on the target article" (`:30-32`). Diese Prüfung ist 1:1 zu übernehmen; sie ist der einzige
Schutz gegen einen manipulierten Request, und der eigene Client erzeugt die Eingabe nie.

#### 5.2.3 Was das bei wachsender Buchungszahl kostet

Zwei verschiedene Kostenarten, und nur eine davon ist die, die zuschlägt.

**(a) Rundreisen und Zeilentransfer — linear.** `artikelListe` (`queries.ts:35-56`) fährt pro
Artikel eine Buchungsabfrage (`:40`) plus `chargenMitRest` mit je einer Chargen- und einer
Buchungsabfrage (`:29-30`): **3·N_Artikel Abfragen**, alle über `idx_buchungen_artikel`
(`schema.ts:105`) indiziert. Übertragen werden dabei über alle Artikel hinweg rund **2·N_Buchungen**
Zeilen — linear, nicht quadratisch. Ebenso linear: `verfallListe` (`:196`), `lagerortVerfallListe`,
`checkHistorie`.

**(b) JS-Filter in Schleifen — quadratisch.** Das ist der Term, der zuschlägt. Vier Lesepfade laden
`buchungen` **komplett** in den Prozess und filtern danach **je Artikel** erneut über die ganze
Liste:

| Pfad | Beleg | Aufwand |
|---|---|---|
| `kennzahlen` | Vollladung `:128`, Filter je Artikel in der Schleife `:136-138` | O(N_Artikel · N_Buchungen) |
| `bestellvorschlag` | Vollladung `:515`, Filter je Artikel `:519` | O(N_Artikel · N_Buchungen) |
| `fahrzeugUebersicht` | Vollladung `:272`, Filter je Artikel je Fahrzeug `:295-297` | O(N_Fahrzeug · N_ArtikelImSoll · N_Buchungen) |
| `sollFuerFahrzeug` | Vollladung `:324`, Filter je Soll-Position `:329` | O(N_Position · N_Buchungen) |

Der Schreibpfad hat dieselbe Klasse in klein: `fefoAbbuchung` lädt **alle** Buchungen des Artikels
ohne Lagerort-Prädikat und filtert erst in JS (`abbuchung.ts:38-41`); `korrekturAufLagerort` tut
dasselbe (`korrektur.ts:18-19`). Ein Fahrzeug-Check mit 60 Artikeln lädt damit die vollständige
Historie von 60 Artikeln zwei- bis dreimal.

**Bandbreiten.** Die Zeilenzahl ist Betreiberfrage 9 und liegt im Volume `lagerbuch_data`; die
folgenden Werte sind **gerechnet, nicht gemessen**, und dienen dazu, die Grenze zu verorten. Annahmen:
400 aktive Artikel, 8 Fahrzeuge, 60 Soll-Positionen je Fahrzeug, `better-sqlite3` liest einfache
Zeilen mit rund 1 μs/Zeile, V8 vergleicht mit rund 10 ns/Element inklusive Zwischenarray.

| `buchungen` | Vollladung | `kennzahlen` (JS-Term) | `fahrzeugUebersicht` (JS-Term) | Urteil |
|---|---|---|---|---|
| 10 000 | ~10 ms | 400 · 10 k = 4 M ≈ 40 ms | 8 · 60 · 10 k = 4,8 M ≈ 50 ms | unauffällig |
| 50 000 | ~50 ms | 20 M ≈ 0,2 s | 24 M ≈ 0,25 s | spürbar, tragbar |
| 100 000 | ~0,1 s | 40 M ≈ 0,4–1 s | 48 M ≈ 0,5–1,2 s | **Grenze** |
| 250 000 | ~0,25 s | 100 M ≈ 1–2,5 s | 120 M ≈ 1,2–3 s | unbrauchbar |
| 500 000 | ~0,5 s | 200 M ≈ 2–5 s | 240 M ≈ 2,5–6 s | unbrauchbar |

**Ab wann es ein Problem ist, hängt nicht an der Sekundenzahl, sondern an `better-sqlite3`.** Der
Treiber ist **synchron**: die Vollladung und der JS-Filter laufen im Event-Loop. Eine
Übersichtsseite, die 1 s rechnet, blockiert für diese Sekunde **die gesamte Suite** — portal, qr,
feedback und files antworten in dieser Zeit nicht. Die Grenze ist damit suiteweit, nicht modulintern,
und sie liegt nach dieser Rechnung bei rund **100 000 Buchungszeilen**.

**Wie schnell das wächst.** Ein Fahrzeug-Check schreibt je Artikel bis zu einer Korrekturzeile
(`check.ts:107`) plus zwei Zeilen je betroffener Charge für die Nachfüllung (`umlagerung.ts:23-33`),
also grob 1–4 Zeilen je Artikel: 60 Artikel ≈ 60–240 Zeilen je Check. Bei 8 Fahrzeugen und
monatlichem Check sind das 6 000–23 000 Zeilen im Jahr, dazu Zugänge und Helfer-Entnahmen. **Ohne
Eingriff ist die Grenze in 4–15 Betriebsjahren erreicht** — und die Alt-Anwendung läuft bereits.
Deshalb ist die genaue heutige Zeilenzahl eine Runbook-Eingabe, die **vor** dem Bau der Leseseite
vorliegen muss, nicht danach.

#### 5.2.4 Entscheidung 7 — rekonstruktiv bleibt, das N+1 fällt

**Entschieden: Variante (b) der Analyse** — der Bestand bleibt rein rekonstruktiv (kein zweiter
Wahrheitsspeicher, `implementierungsplan.md:198`), aber jede Rechnung aus 5.2.3 (b) wird durch **eine
aggregierende SQL-Abfrage** ersetzt. Das ist verhaltensneutral und fällt beim Neubau der Leseseite
ohnehin an; Variante (c), eine materialisierte Bestandstabelle, widerspricht der Leitplanke und ist
verworfen (§13).

Vorgeschrieben sind vier Aggregate in `_lib/lesepfade/bestand.ts`:

```ts
/** Bestand je Artikel an EINEM Lagerort. Ersetzt jede allBu.filter()-Schleife.
 *  Index: idx_buchungen_lagerort_artikel (§4.14). */
export function bestandJeArtikel(db: DB, lagerortId: string): Map<string, number> {
  const rows = db
    .select({ artikelId: buchungen.artikelId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(eq(buchungen.lagerortId, lagerortId))
    .groupBy(buchungen.artikelId)
    .all();
  return new Map(rows.map((r) => [r.artikelId, r.summe]));
}

/** Rest je Charge an EINEM Lagerort. Ersetzt bestandProLagerortUndCharge über Vollladung. */
export function restJeCharge(db: DB, lagerortId: string): Map<string, number> { /* group by charge_id */ }

/** Bestand je (Artikel, Lagerort) für ALLE Lagerorte — eine Abfrage für die Fahrzeugübersicht. */
export function bestandJeArtikelUndLagerort(db: DB): Map<string, Map<string, number>> { /* group by beide */ }

/** Rest je Charge EINES Artikels an EINEM Lagerort — der Lesepfad des Schreibwegs.
 *  Index: idx_buchungen_artikel_lagerort_charge (§4.14). */
export function restJeChargeFuerArtikel(db: DB, artikelId: string, lagerortId: string): Map<string, number> {}
```

Die dafür nötigen Indizes stehen in §4.14; **die Liste dort ist die eine Stelle**, an der die vier
neuen Indizes geführt werden. `fefoAbbuchung` und `korrekturAufLagerort` bekommen
`restJeChargeFuerArtikel` statt der Vollladung — das Prädikat wandert damit erstmals in die Abfrage
(`abbuchung.ts:38` hat es heute nicht).

**Die Falle bei dieser Entscheidung — ausdrücklich benannt.** Wenn die Leseseite auf SQL-Aggregation
wechselt, leben die reinen Funktionen aus `bestand.ts` nur noch in ihren eigenen Tests. Die Tests sind
dann grün und bewachen nichts mehr. Deshalb gilt:

1. Die reinen Funktionen bleiben **die Spezifikation**. Sie werden mitportiert, nicht gelöscht.
2. Jedes Aggregat schuldet einen **Differenztest** gegen seine reine Funktion: derselbe
   Zeilenbestand, einmal über SQL, einmal über `bestandProLagerort` bzw.
   `bestandProLagerortUndCharge`, beide Ergebnisse identisch — inklusive der Fälle, die das Scoping
   überhaupt erst nötig machen: **dieselbe `chargeId` liegt gleichzeitig im Handlager und in einem
   Fahrzeug** (die Konstellation aus `bestand.ts:22-24`), und **ein Artikel hat Buchungen an drei
   Lagerorten**.
3. `sql<number>` mit `sum(...)` liefert bei leerer Gruppe **keine Zeile**, nicht `0`. Jede
   Map-Abfrage geht über `?? 0`. Das ist die stille Bruchstelle dieser Umstellung: heute liefert
   `bestandProLagerort` für einen Artikel ohne Buchungen `0`, morgen fehlt der Schlüssel.

---

### 5.3 FEFO — und drei Stellen, an denen die Charge geraten wird

#### 5.3.1 Die Verteilung

`fefoVerteilung(chargen, menge)` (`src/lib/domain/fefo.ts:3-19`): Chargen mit `rest > 0` werden
aufsteigend nach `verfall` sortiert (`:10`), dann wird `menge` von vorn abgeräumt, je Charge ein
Teil, Abbruch wenn nichts mehr übrig ist (`:12-17`). Negative Mengen werden auf 0 geklemmt (`:7`).
Fehlt Bestand, ist die Rückgabe **kürzer** als angefordert — der Aufrufer meldet die tatsächlich
gebuchte Menge (`buchung.ts:74`, `:92`).

**Entschieden: FEFO wird deterministisch gemacht — über die Sortierung, nicht über einen Index.**
`fefo.ts:10` sortiert heute **nur** nach `verfall`; bei gleichem Verfall entscheidet die
Rückgabereihenfolge der Datenbank, und die ist kein Vertrag. Zusammen mit dem fehlenden Unique-Index
auf `(artikelId, chargenNr, verfall)` (§4.8) heißt das: dieselbe Chargennummer zweimal erfasst
spaltet den Bestand in zwei Töpfe mit identischem Verfall, und welcher zuerst verbraucht wird, ist
unbestimmt. Die Sortierung wird deshalb zu

```ts
.sort((a, b) => a.verfall.localeCompare(b.verfall)
             || a.createdAt.getTime() - b.createdAt.getTime()
             || a.chargeId.localeCompare(b.chargeId));
```

`ChargeRest` trägt dafür zusätzlich `createdAt` — die Spalte existiert (`schema.ts:62`), sie wird
heute nur nicht durchgereicht. Kosten: ein Feld mehr in einem Objektliteral. Nutzen: „gleicher
Verfall, ältere Charge zuerst" ist eine fachliche Aussage; „was die Datenbank gerade zurückgibt"
ist keine.

⚠️ **Und damit fällt der Unique-Index als Mittel weg.** §4.8 nimmt ihn nicht auf: er setzte eine
Annahme über Produktionsdaten voraus, die im Repo nicht belegbar ist, und er verböte einen realen
Vorgang (zwei Lieferungen mit derselben aufgedruckten Chargennummer). Der Tiebreaker oben löst
dasselbe Problem ohne beides. Die Diagnose-Abfrage aus §4.8 bleibt als Runbook-Eingabe — sie meldet,
**dass** es Doppel gibt, sie ist aber keine Sperre.

#### 5.3.2 Die Pseudo-Charge „2099-12" — drei Namen, eine Bedeutung

Drei Schreibpfade legen eine Charge mit `verfall = "2099-12"` an, unter drei verschiedenen Nummern:

| Beleg | `chargenNr` | Anlass |
|---|---|---|
| `inventur.ts:42` | `"Inventur"` | Zählung ergibt Plus, Artikel hat noch keine Charge |
| `korrektur.ts:33` | `"Korrektur"` | Lagerort-Abgleich ergibt Plus, Artikel hat keine Charge |
| `csv.ts:31` | `"ohne Verfall"` | CSV-Startbestand |

**Entschieden:** Die Bedeutung hängt am **Verfallswert**, nicht am Namen. `_lib/konstanten.ts`
definiert `PSEUDO_VERFALL = "2099-12"` und `istOhneVerfall(v: string) => v === PSEUDO_VERFALL`; jede
Anzeige, jeder Filter und jede Ampel-Sonderbehandlung geht über diese Funktion, **nie** über die
Chargennummer. Die drei Nummern bleiben als Herkunftshinweis erhalten — sie sind das einzige
Fundstück, das später noch sagt, woher eine Zeile kam. Wer stattdessen über die Nummer filtert,
verliert zwei von drei Fällen, und kein Gate meldet das.

`verfallStatus("2099-12", …)` liefert bis 2099 `"gruen"`; die Verfallsliste blendet grün aus
(`queries.ts:204`), die Pseudo-Charge taucht dort also nicht auf. Das bleibt so.

#### 5.3.3 Die geratene Charge — und warum `lagerort_verfall` existiert

Bei `diff > 0` wählt `korrekturAufLagerort` die **jüngste Charge des Artikels ohne jeden
Lagerortbezug** (`korrektur.ts:27-30`: Sortierung `verfall` absteigend, Tiebreak `createdAt`
absteigend). Der Fahrzeug-Check kann Fahrzeugbestand damit auf eine Charge buchen, die nie im
Fahrzeug lag. Dieselbe Wahl trifft `inventur.ts:38`.

**Das ist kein Defekt, den man beim Port „behebt", sondern ein bewusster Kompromiss mit einer
Kompensation:** weil die Charge geraten ist, ist die Frage „wann läuft das Zeug im Fahrzeug ab?"
über Chargen nicht beantwortbar — und genau dafür gibt es die Tabelle `lagerort_verfall`
(`schema.ts:67-73` schreibt die Begründung aus, §4.11). **Wer beim Neubau das Verfall-Feld im
Zählschritt als redundant streicht („die Charge hat doch einen Verfall"), zerstört diese
Kompensation lautlos.** Die Fahrzeug-Verfallsampel hängt danach an einer geratenen Charge, und
typecheck, lint und Vitest bleiben grün (Falle 9).

**Verbindlich:** Der Zählschritt des Fahrzeug-Checks trägt das Verfall-Feld je Artikel. Es ist
optional (leer = keine Angabe), monatsgenau, und es ist **das einzige** Feld, aus dem die
Fahrzeug-Verfallsliste gespeist wird. Die Gestaltung (eigene Zeile, 18px, natives `<input
type="month">`) steht in §7.7.2.

---

### 5.4 Bestellvorschlag — Lückenformel, `BESTELL_FAKTOR` fällt

**Entschieden (Betreiber-Entscheidung 5, Analyse-Entscheidung 3, Variante a):**

```
braucht(bestand, mindestbestand)      := bestand < mindestbestand           // vorschlag.ts:1-3
vorschlagsmenge(bestand, mindestbestand) := max(0, mindestbestand − bestand) // vorschlag.ts:7-12
```

`bestand` ist immer der **Handlager**-Bestand (`queries.ts:519`). Die Liste enthält genau die aktiven
Artikel, für die `braucht` wahr ist (`queries.ts:516`, `:522`); für jede enthaltene Zeile ist der
Vorschlag damit ≥ 1.

**`BESTELL_FAKTOR` wird ersatzlos gestrichen** — vollständig begründet in §4.8 und §10.2, inklusive
der drei mitzustreichenden Teststellen. `WARN_TAGE_KRITISCH`, `WARN_TAGE_FAELLIG` und
`HELFER_SESSION_STUNDEN` bleiben Runbook-Eingaben unter neuen Namen (§10.1, §10.3); ihre Vorgaben
stehen im Code (`config.ts:36-37`, `:39`: 31, 56, 12).

---

### 5.5 Bestellt-Markierung — nachgeprüft, und was daraus folgt

`artikel.bestelltAt` (`schema.ts:51`) ist eine `timestamp`-Spalte, nullable. Genau drei Stellen
berühren sie:

| Beleg | Wirkung |
|---|---|
| `bestellung.ts:14` | setzt `new Date()` oder `null` — je nach Schalter, **ohne Journalzeile** |
| `buchung.ts:42` | setzt **bedingungslos** `null`, in derselben Transaktion wie ein Zugang |
| `queries.ts:141`, `:520` | die beiden Leser |

**Die Analyse führt die Nullung als nicht rekonstruierbar. Nachgeprüft — und der Befund ist
schärfer: es sind beide Übergänge.** `bestellung.ts:14` schreibt ebenfalls keine Journalzeile;
sowohl „auf bestellt gesetzt" als auch „zurückgesetzt" hinterlassen **nur** den aktuellen Spaltenwert.
Daraus folgt dreierlei:

1. **`bestelltAt` trägt genau eine wahre Aussage: „seit wann steht die aktuelle Markierung".** Alles
   Frühere ist weg. Der Import übernimmt den Spaltenwert unverändert und **erfindet keine Historie**;
   es gibt keine Zeile, aus der man eine rekonstruieren könnte. Der heutige Leser
   `queries.ts:520` wirft die einzige verwertbare Information weg (`bestellt: Boolean(a.bestelltAt)`).
   **Entschieden:** die Bestellliste zeigt „bestellt seit &lt;Datum&gt;" statt eines Hakens — dieselbe
   Spalte, eine Aussage mehr, null Migrationskosten. ⚠️ Am **CSV-Format** ändert das nichts: dort
   bleibt `Status` = `bestellt`/`offen` (§9.2, 1:1-Pflicht 28).

2. **Nur ein Zugang löscht die Markierung — und der ist nicht der einzige Weg, wie Ware ankommt.**
   Nachgeprüft: `inventur.ts:44` schreibt `typ: "korrektur"`, `csv.ts:37` schreibt `typ: "korrektur"`,
   `umlagerung.ts:28` schreibt `typ: "umlagerung"`. **Eine als Inventurkorrektur oder per CSV-Import
   eingebuchte Lieferung lässt die Markierung „bestellt" stehen** — der Artikel bleibt bis zum
   nächsten echten Zugang oder bis zum manuellen Zurücksetzen als bestellt geführt, obwohl die Ware
   da ist. **Entschieden:** das bleibt 1:1. Die Alternative — „jede positive Korrektur am Handlager
   löscht die Markierung" — ist erfunden, im Bestand nicht belegt und würde eine Inventur-Zählung
   nach oben mit einer Lieferung verwechseln. Stattdessen wird die Regel **ausgeschrieben** und die
   Bestellliste zeigt sie: ein Artikel, der „bestellt" ist und **nicht** unter Mindestbestand liegt,
   bekommt den Hinweis „Ware offenbar eingetroffen — Markierung zurücksetzen?".

3. **Die Nullung ist bedingungslos.** `buchung.ts:42` läuft auch für einen Artikel, der nie
   markiert war, und unabhängig von der Zugangsmenge. Das ist harmlos und bleibt.

**Die Kennzahl heißt falsch herum.** `queries.ts:139-141` zählt `offeneBestellungen` genau dann
hoch, wenn ein Artikel unter Mindestbestand liegt **und `bestelltAt` NICHT gesetzt ist** — also die
Zahl der **noch nicht** bestellten Positionen. Die Oberfläche beschriftet sie mit „offene
Bestellpositionen" (`src/app/verwaltung/(admin)/page.tsx:52`), was jeder Leser als „bestellt, noch
nicht geliefert" versteht. **Entschieden:** das Feld heißt im Zielmodul `nichtBestellt`, die
Beschriftung lautet „unter Mindestbestand, noch nicht bestellt". Das ist eine Korrektur einer
Fehlbenennung, kein Verhaltensbruch — die Zahl bleibt dieselbe.

---

### 5.6 Verfall

#### 5.6.1 Die Ampel

`verfallStatus(verfall, {kritisch, faellig}, now)` (`src/lib/domain/verfall.ts:3-18`):

```
ende  = monatsEnde(verfall)   // _lib/zeit.ts, zonenexplizit (§4.5) — ersetzt new Date(y,m,0,…)
tage  = ceil((ende − now) / 86 400 000)                            // :11
abgelaufen = ende < now                                            // :12
ampel = tage ≤ kritisch ? "rot" : tage ≤ faellig ? "gelb" : "gruen" // :14-16
```

Vorgaben: `kritisch = 31`, `faellig = 56` (`config.ts:36-37`) — im Zielmodul unter den Namen
`LAGERBUCH_VERFALL_ROT_TAGE` und `LAGERBUCH_VERFALL_GELB_TAGE` (§10.1). Beide sind Runbook-Eingaben;
ein abweichender Produktivwert verschiebt nur Schwellen, kein Verhalten.

Drei Eigenschaften, die beim Neubau leicht verlorengehen:

- **`abgelaufen` und `ampel === "rot"` sind nicht dasselbe.** Eine abgelaufene Charge ist immer rot,
  eine rote nicht immer abgelaufen. Die Verfallsliste sortiert danach in drei Rängen: abgelaufen (0),
  rot (1), gelb (2), Zweitkriterium `verfall` aufsteigend (`queries.ts:213-214`). Die
  Lagerort-Verfallsliste hat vier Ränge inkl. grün und ein drittes Kriterium `lagerortName`
  (`queries.ts:248-249`).
- **`tage` ist aufgerundet.** Eine Charge, die in 12 Stunden abläuft, hat `tage = 1`, nicht `0`.
- **Der Chip-Text ist Vertrag, nicht Dekoration.** `chargeText` (`src/lib/format.ts:29-34`):
  abgelaufen → `"abgelaufen"`, rot → `"läuft MM/JJ ab"`, gelb → `"fällig MM/JJ"`, grün →
  `"bis MM/JJ"`. `fmtVerfall` (`:8-11`) macht aus `"2026-03"` das `"03/26"`.

#### 5.6.2 Verfall je Charge (Handlager) und Verfall je Lagerort (Fahrzeug)

Zwei getrennte Quellen, bewusst:

**Chargen-Verfall.** `verfallListe` (`queries.ts:187-216`) rechnet den Rest je Charge **nur im
Handlager** (`:195-198`) und lässt Chargen mit Rest ≤ 0 sowie grüne aus (`:202`, `:204`). Die
Begründung steht im Quelltext (`:192-194`): eine komplett aufs Fahrzeug umgelagerte abgelaufene
Charge erschiene sonst hier, und der Aussondern-Knopf — der ausschließlich den Handlager-Rest bucht
(`aussondern.ts:30-37`) — würde reproduzierbar fehlschlagen. **Dieselbe Bindung gilt für die KPIs**
(`queries.ts:129-132`): `chargenKritisch` und `chargenAbgelaufen` zählen Handlager-Reste.

**Lagerort-Verfall.** `lagerort_verfall` trägt je **(Lagerort, Artikel)** genau **einen** Wert
(Unique-Index `schema.ts:85`), gepflegt per Upsert (`lagerort-verfall.ts:56-62`). `null`/`""` löscht
die Angabe (`:51-54`). Der Wert ist **das früheste Datum, das im Fahrzeug auf einer Packung steht** —
nicht die Charge. Er wird an drei Stellen geschrieben: im Fahrzeug-Check (`check.ts:156`), aus der
Verwaltung heraus (`lagerort-verfall.ts:37`), und gelöscht, wenn der Artikel an diesem Fahrzeug aus
dem Soll fällt (`fahrzeuge.ts:80`).

**Zwei Zugehörigkeitsprüfungen, die 1:1 mitgehen müssen** (der eigene Client erzeugt die
verletzende Eingabe nie, ein manipulierter Request schon): der Artikel muss an diesem Lagerort im
Soll stehen — geprüft in der Verwaltungsaktion (`lagerort-verfall.ts:30-36`) und im Check
(`check.ts:153-155`).

**Die alte Angabe ist nach dem Upsert weg.** `lagerort_verfall` hat keine Historie und keinen
Trigger; wer den Verfall im Fahrzeug korrigiert, überschreibt. Das ist gewollt (ein Fahrzeug hat
einen aktuellen frühesten Verfall, keine Verlaufskurve) und bleibt.

#### 5.6.3 Die Meldung im Fahrzeug-Check

Der Check schreibt die gemeldeten Verfälle (`check.ts:154-157`) und zählt **danach** über den
**gesamten** Fahrzeugstand, nicht nur über die in diesem Check angefassten Artikel
(`check.ts:158-162`, Begründung `:158-159`). `verfallAuffaellig` ist die Zahl der Einträge mit
`ampel !== "gruen"`.

Der Snapshot landet in `checks.ergebnis` unter `verfall`. **Beim Lesen wird die Ampel neu gegen heute
gerechnet, nicht der damalige Zustand angezeigt** (`queries.ts:477-487`, Begründung `:477-478`): ein
damals grünes Datum kann inzwischen abgelaufen sein. Das ist eine bewusste Entscheidung und bleibt —
mit der Konsequenz, dass die Check-Detailseite für denselben Check über die Zeit verschiedene
Ampeln zeigt. **Verbindlich für die Oberfläche:** die Detailseite schreibt aus, dass die
Verfall-Ampel gegen **heute** gerechnet ist, nicht gegen den Check-Zeitpunkt. Ohne diesen Satz liest
jemand einen Nachweis falsch.

#### 5.6.4 Entscheidung 6 — ein Monats-Regex

Heute existieren **zwei** Validatoren für dasselbe Feld:

| Beleg | Ausdruck | Streng? |
|---|---|---|
| `src/db/lagerort-verfall.ts:10` (`MONAT_REGEX`) | `/^\d{4}-(0[1-9]\|1[0-2])$/` | ja |
| `src/actions/buchung.ts:17` (neue Charge beim Zugang) | `/^\d{4}-\d{2}$/` | nein |
| `src/actions/bz.ts:83` (Kompressen-Verfall) | `/^\d{4}-\d{2}$/` | nein |

Der Ausfall, der daraus folgt, und die Entscheidung — **(a) plus Bestandsprüfung, ohne CHECK** —
stehen vollständig in §4.6. Für die Fachlogik zählt: `_lib/konstanten.ts` exportiert **einen**
`MONAT_REGEX`, alle drei Eingangsprüfungen benutzen ihn, und `setzeVerfall`
(`lagerort-verfall.ts:55`) ebenso.

---

### 5.7 Soll/Ist, Fahrzeug-Vorlagen, Grabsteine

#### 5.7.1 Das Soll

`soll_positionen` trägt je Zeile `(fahrzeugId, fachLabel, sort, artikelId, soll)` plus drei
Herkunftsfelder. **Derselbe Artikel darf in mehreren Fächern stehen** — und teilt sich dann **einen**
Fahrzeugbestand. Das ist die zentrale Asymmetrie des Modells:

> Das **Soll** ist pro (Fahrzeug, Fach, Artikel). Der **Bestand** ist pro (Fahrzeug, Artikel).

Daraus folgt jede Aggregation im Check (§5.8) und in der Übersicht: `fahrzeugUebersicht` summiert
das Soll je Artikel, **bevor** es gegen den Fahrzeugbestand vergleicht (`queries.ts:290-297`,
Begründung `:290-291`). Wer je Position vergleicht, zählt Artikel in zwei Fächern doppelt unter Soll.

**Herkunft** (`queries.ts:330`): kein `templatePositionId` → `"manuell"`; `templatePositionId` gesetzt
und `ueberschrieben` → `"ueberschrieben"`; sonst `"vorlage"`.

**Grabsteine.** `entfernt = true` heißt „diese Vorlagen-Position ist auf diesem Fahrzeug bewusst
nicht vorhanden". Ein Grabstein ist **kein Soll**: er wird aus der Übersicht (`queries.ts:274`), aus
dem Check (`check.ts:83`) und aus der Vorlagen-Erzeugung (`templates.ts:186`) herausgefiltert.
`sollFuerFahrzeug` gibt ihn dagegen **mit** zurück, damit der Editor ihn zeigen und wiederherstellen
kann (`queries.ts:320-321`, `fahrzeuge.ts:89-96`). **Verbindlich:** jede neue Ansicht, die „das Soll"
braucht, filtert `entfernt` selbst heraus — `sollFuerFahrzeug` tut es nicht.

#### 5.7.2 Vorlagen-Synchronisierung

`syncFahrzeugTemplate` (`src/db/template-sync.ts:21-75`) **materialisiert**: es rechnet nichts live,
sondern schreibt in `soll_positionen`, weil der Check-Flow ausschließlich diese Tabelle liest
(`:13-17`). Der Algorithmus in vier Regeln:

1. Vorlagen-Position ohne verknüpfte Fahrzeug-Zeile → anlegen (`:36-45`), `hinzugefuegt++`.
2. Verknüpfte Zeile mit `ueberschrieben` **oder** `entfernt` → unangetastet lassen (`:47-50`),
   `uebersprungen++`.
3. Sonst: nur schreiben, wenn sich `fachLabel`, `sort`, `artikelId` oder `soll` unterscheiden
   (`:52-58`), `aktualisiert++`.
4. Verwaiste Zeile (Vorlagen-Position gelöscht): `ueberschrieben` → von der Vorlage lösen und als
   manuelle Zeile behalten (`:64-67`, `losgeloest++`); sonst löschen (`:69-70`, `entfernt++`).

`SyncErgebnis` mit diesen fünf Zählern ist die Rückmeldung an die Oberfläche
(`template-sync.ts:5-11`) und wird über alle Fahrzeuge summiert, wenn eine ganze Vorlage
synchronisiert wird (`templates.ts:143-148`).

**Zwei Nebenwege mit eigener Semantik:**

- **Lösen** (`templates.ts:164-174`): Grabsteine werden **verworfen** (`:167` — ohne Verknüpfung
  ergeben sie keinen Sinn), materialisierte Zeilen bleiben als individuelle Bestückung erhalten
  (`:169-172`), `lagerorte.templateId` wird genullt (`:173`). Das ist auch der Weg, den
  `deleteTemplate` für jedes verknüpfte Fahrzeug geht (`templates.ts:52`), damit keine
  Fremdschlüssel brechen.
- **Vorlage aus Fahrzeug** (`templates.ts:180-204`): kopiert die nicht entfernten Zeilen in eine neue
  Vorlage und **adoptiert** die vorhandenen Fahrzeug-Zeilen paarweise in Anlagereihenfolge
  (`:197-199`), damit keine Duplikate entstehen. Die Paarung über den Index ist fragil, aber sie ist
  in derselben Transaktion aus derselben Quelle erzeugt — die Reihenfolge stimmt konstruktiv.
  **Verbindlich:** dieser Zusammenhang gehört als Kommentar mit, sonst wirkt `for (let i = 0; …)` wie
  ein Versehen und wird „repariert".

`templatePositionEntfernen` (`templates.ts:83-100`) löst referenzierende Fahrzeug-Zeilen **zuerst**
auf, sonst FK-Verletzung — mit derselben Regel wie Regel 4 oben.

---

### 5.8 Der Fahrzeug-Check — eine Transaktion, sechs Schritte

`checkAbschluss` (`src/actions/check.ts:72-177`) ist der komplexeste Schreibpfad des Moduls. Alles
läuft in **einer** `db.transaction` (`:81`).

**Schritt 0 — gültige Positionsmenge.** Grabsteine raus (`:83`), Nachschlagetabelle nach
`sollPositionId` (`:84`). Eine eingereichte Position, die nicht zu diesem Fahrzeug gehört, bricht ab
(`:94`).

**Schritt 1 — klemmen und aggregieren.** Je Position wird der Nachfüllwunsch auf `max(0, soll − ist)`
geklemmt (`:95`), dann wird **nach `artikelId`** gruppiert (`:96-101`): `sollSumme`, `istSumme`,
`nachfuellGewuenscht`. Der Positions-Snapshot (`sollPositionId`, `artikelId`, `soll`, `ist`) geht
unverändert ins Ergebnis (`:102`).

**Schritt 2 — Abgleich je Artikel.** `korrekturAufLagerort(artikelId, fahrzeugId, istSumme)`
(`:107-110`). Danach gilt I4. `recordedVorher = istSumme − korrektur` (`:111`) — der Bestand vor dem
Check, rekonstruiert, nicht gemessen.

**Schritt 3 — Nachfüllen je Artikel.** `umlagerung(Handlager → Fahrzeug, nachfuellGewuenscht)`
(`:112-118`). Die tatsächlich umgelagerte Menge ist an der Handlager-Verfügbarkeit gekappt;
`offen += max(0, sollSumme − istSumme − nachfuellGebucht)` (`:120`) ist das, was **nach** dem Check
noch fehlt.

**Reihenfolge ist tragend:** erst Abgleich, dann Nachfüllen. Umgekehrt würde die Nachfüllung vom
Abgleich wieder herauskorrigiert.

**Schritt 4 — Geräte.** Nur Geräte, die wirklich an diesem Standort stehen (`:126-128`).
`geraeteAuffaellig` zählt `!vorhanden || zustand === "Defekt"` (`:129`).

**Schritt 5 — Sauerstoff.** Nur Flaschen dieses Standorts (`:136-139`). Je Flasche eine
Messung in `o2_messungen` (`:140-143`). Der **Nennfülldruck wird als Snapshot mitgeschrieben**
(`:147`, Begründung `:145-146`), damit der Füllstand später auch dann rekonstruierbar ist, wenn die
Flasche umkonfiguriert oder gelöscht wird.

**Schritt 6 — Verfall.** Siehe §5.6.3.

Dann eine Zeile in `checks` mit dem gesamten Ergebnis als JSON (`:164-168`).

#### 5.8.1 Entscheidung 1 — „Ist = Soll" bleibt, und die Kosten stehen daneben

**Entschieden: Variante (a), 1:1.** Der Zählschritt bleibt auf Soll vorbelegt
(`CheckFlow.tsx:97`: `ist[p.id] ?? p.soll`), und der Abschluss sendet **alle** Positionen
(`CheckFlow.tsx:146`). Die Begründung der Analyse trägt: die Konvention ist dokumentiert
(`CheckFlow.tsx:94-96`: „voll annehmen, Gezähltes runterkorrigieren"), im Text der Oberfläche
ausgeschrieben (`CheckFlow.tsx:244-248`) und testverankert (`check.test.ts:63-71` sendet `ist: 4`
gegen `soll: 4` und behauptet `bestandProLagerort === 4` mit dem Kommentar „+4
Eröffnungs-Korrektur"). Sie ist außerdem die richtige Bedienpraxis am Handy im Fahrzeug: Abweichungen
antippen ist schneller als alles einzeln bestätigen.

**Was das kostet, steht hier, damit es niemand später „entdeckt":** serverseitig ist „gezählt und
stimmt" von „nicht gezählt" **nicht unterscheidbar**. Ein durchgeklickter Check erzeugt einen
positiven, plausibel aussehenden Nachweis und — wenn der recorded Bestand abwich — eine
Korrekturbuchung in ein Journal, das weder `UPDATE` noch `DELETE` kennt.

**Variante (c) — ein `gezaehlt: boolean` je Position — ist die einzige, die den fehlenden Nachweis
nachrüstet.** Sie kostet ein Feld im Zod-Schema, ein Feld in `checks.ergebnis` (Formatversion 3, also
einen dritten Zweig in beiden Lesern) und das Umschreiben von `check.test.ts:63-71` sowie
`e2e/geraete.spec.ts:59-61`. Sie ist **Backlog, nicht Spec 1** (§15), und sie ist hier benannt, damit
sie eine Entscheidung bleibt und nicht als Nebenwirkung stattfindet.

**Dieselbe Vorbelegung gilt für Geräte und Flaschen** (`CheckFlow.tsx:25`:
`{vorhanden: true, zustand: "In Ordnung"}`; `:137`: Druck = Nennfülldruck) und beide Listen werden
vollständig gesendet (`:147-151`). Auch das bleibt 1:1 — mit **einer** Auflage, die nichts kostet:

> **Verbindlich:** Die Herkunft einer Messung ist in jeder Anzeige sichtbar. `o2_messungen` trägt
> `quelleTyp = "token"` und einen Kommentar `"Fahrzeug-Check <referenz>"` (`check.ts:142`), eine
> manuell erfasste Messung `quelleTyp = "oidc"` (`sauerstoff.ts:57`). Der Verlauf und die
> Flaschenübersicht kennzeichnen check-stammende Messungen als solche. Die Angabe ist heute schon
> da; sie wird nur nirgends gezeigt.

Damit ist der Falle-8-Befund („durchgeklickt sieht aus wie geprüft") nicht beseitigt, aber
**lesbar** — und das ist die ehrliche Stufe, solange Variante (c) Backlog ist. ⚠️ Es ist zugleich der
Grund, warum `o2_messungen` **keine** Append-only-Trigger bekommt (§4.4): diese Zeilen müssen
entfernbar bleiben.

#### 5.8.2 Entscheidung 2 — `zustand` wird ein Enum

**Entschieden: Variante (b).** `ZUSTAENDE = ["In Ordnung", "Gebrauchsspuren", "Defekt"] as const`
wandert nach `_lib/konstanten.ts` — **ohne `"use client"`** (§5.1). Das Zod-Schema der Check-Action
nimmt `z.enum(ZUSTAENDE).optional()` statt `z.string().trim().optional()` (heute `check.ts:35`). Die
drei Auswerter (`check.ts:129`, `queries.ts:379`, `queries.ts:499`) vergleichen gegen
`ZUSTAND_DEFEKT`, nicht gegen ein Literal.

**Altdaten bleiben unberührt (kein Backfill, Variante c verworfen).** Ein Backfill hieße `UPDATE
checks` — möglich, weil `checks` keinen Trigger trägt, aber sinnlos: die drei Werte sind seit jeher
dieselben, ein Backfill hätte nichts zu tun. **Aber die Leser müssen tolerant bleiben:** ein
`checks.ergebnis` aus einem Altcheck kann theoretisch einen fremden String tragen, und
`geraeteAuffaellig` muss dafür weiter rechnen. Regel: **beim Schreiben streng, beim Anzeigen
tolerant** — unbekannter Zustand wird angezeigt wie gespeichert und zählt **nicht** als auffällig
(so wie heute, `check.ts:129`).

Das schließt zugleich eine Lücke, die kein Gate findet: der Servertyp ist heute `string`, TypeScript
ist strukturell außerstande, die Kopplung zwischen dem Client-Literal und den drei
Stringvergleichen zu sehen.

#### 5.8.3 Die zwei Ergebnisformate

`checks.ergebnis` trägt **zwei inkompatible JSON-Formate**, und beide Leser können beide; die
vollständige Feldliste und der Parser `parseCheckErgebnis` stehen in §4.10.

**Entschieden: beide Zweige gehen mit.** Das Altformat ist im Produktionsbestand und nicht
konvertierbar (es trägt die Information schlicht nicht). `altFormat: true` bleibt ein Feld der
Detailantwort (`queries.ts:412`), und die Detailseite **sagt es** (§11.5, Zustand 26). Alles andere
ist eine leere Tabelle, die wie ein Fehler aussieht.

Beide Leser fangen kaputtes JSON ab und liefern Nullen bzw. leere Listen (`queries.ts:382`, `:490`).
Das bleibt — mit der Auflage, dass der Zähl-Zweig und der Detail-Zweig **dieselben** Summen liefern:
`nachgefuellt`, `korrigiert` (Betrag!), `offen`, `geraeteAuffaellig`, `flaschenAuffaellig` und der
neue Zähler „nicht bewertbar" (§5.12). Heute rechnen sie das an zwei Stellen getrennt
(`queries.ts:374-380` gegen `:496-501`); im Zielmodul rechnet **eine** Funktion
`summiereCheckErgebnis(roh)` in `_lib/domain/check.ts`, die beide benutzen und die intern
`parseCheckErgebnis` ruft.

#### 5.8.4 Fehlmengen

`fehlmengen(positionen)` (`src/lib/domain/check.ts:3-5`): `fehlt = max(0, soll − ist)`, nur Einträge
mit `fehlt > 0`. Generisch über `T extends {soll, ist}`, damit Aufrufer ihre Positionsidentität
durchreichen können. Übernahme 1:1.

---

### 5.9 Inventur

`inventurKorrektur` (`src/actions/inventur.ts:20-53`), eine Transaktion (`:25`):

- Pflicht-Kommentar, mindestens eine Position (`:12-15`).
- Je Position: `bestandJetzt` = **Handlager**-Bestand (`:28-29`), `diff = ist − bestandJetzt` (`:30`).
- `diff === 0` → übersprungen (`:31`), zählt **nicht** als korrigiert.
- `diff < 0` → FEFO-Abbuchung mit `typ: "korrektur"` und `referenz` (`:33`).
- `diff > 0` → auf die **jüngste** existierende Charge des Artikels (`verfall` absteigend, Tiebreak
  `createdAt` absteigend, `:38`), sonst eine neue Pseudo-Charge (`:40-43`).
- Gemeinsame `referenz = "inventur:<id>"` (`:23`) klammert alle Zeilen eines Laufs.

**Die Absendekonvention ist der Check-Konvention entgegengesetzt — und das ist richtig so.**
`InventurForm.tsx:24-25` sendet **nur** die vom Nutzer angefassten Positionen, mit ausgeschriebener
Lost-Update-Begründung: nicht angefasste Artikel würden sonst mit dem veralteten Seitenlade-Snapshot
als `ist` gebucht und parallele Entnahmen still rückgängig machen. **Verbindlich:** diese Konvention
bleibt, und der Kommentar bleibt bei ihr. Wer die beiden Formulare beim Neubau „vereinheitlicht",
baut je nach Richtung entweder einen Lost-Update-Kanal oder einen Check, der nichts bucht.

Die Client-Seite prüft den Pflichtkommentar zusätzlich (`InventurForm.tsx:20`) und lehnt eine leere
Zählung ab (`:26`). Beides ist Bequemlichkeit vor dem Serverfehler; der Server ist die tragende
Prüfung (`inventur.ts:13-14`).

---

### 5.10 Geräte — Fälligkeit aus einem Tagesdatum

`src/lib/domain/geraet.ts`:

- `parseTag(datum)` (`:16-25`) akzeptiert **nur** `"YYYY-MM-DD"` und weist überrollende Kalendertage
  ab (`"2026-02-31"` → `null`, Prüfung `:23`).
- `datumFaelligkeit(datum, now, warnTage)` (`:32-45`): kein/ungültiges Datum → `keinDatum: true`,
  Ampel **grün** und `ueberfaellig: false` (`:34-36`) — die Oberfläche zeigt das **grau**, nicht rot,
  damit ein frisch angelegtes Gerät ohne gepflegtes Datum keinen Fehlalarm auslöst (`:28-30`).
- `tageBisFaellig` ist gerundet gegen den **Tagesanfang in `ZEITZONE`** (`startDesTages`, §4.5;
  heute `:37-38` mit lokalen Komponenten): heute = 0, gestern = −1.
- `ueberfaellig` = `tageBisFaellig < 0` → rot; `≤ warnTage` (inkl. heute) → gelb; sonst grün
  (`:39-43`).
- Warnfenster: `MTK_WARN_TAGE = 30`, `OBJEKT_ABLAUF_WARN_TAGE = 30` (`:4-5`) — **Konstanten im Code,
  keine Umgebungsvariablen** (§10.3). Das bleibt so; sie sind fachliche Fristen, keine
  Betriebsschrauben.
- `geraetFaelligkeit(g, now)` (`:54-58`) wählt nach Typ: `medizin` → `mtkFaellig`, `objekt` →
  `ablaufdatum`.

**Der Chip-Text ist Vertrag** (`src/lib/format.ts:50-65`): bei `medizin` gibt es **immer** einen Chip,
auch ohne Datum („kein MTK-Datum", grau); bei `objekt` ist das Ablaufdatum optional und ohne Datum
gibt es **keinen** Chip (`:61`). „heute fällig" ist ein eigener Text (`:58`, `:63`), weil „in 0 T"
sich falsch liest.

**Die Typ-Trennung ist eine Schreibinvariante:** `geraetSpeichern` hält typ-fremde Felder
ausdrücklich auf `null` (`src/actions/geraete.ts:39-42`). Ein Objekt hat nie ein MTK-Datum, ein
Medizingerät nie eine Beschreibung. Übernahme 1:1.

---

### 5.11 BZ-Geräte — Kontrollen, Bewertung, Akku

`src/lib/domain/bz.ts`:

**Fälligkeit** (`:18-30`). `BZ_KONTROLL_INTERVALL_TAGE = 31` (`:4`), `BZ_WARN_TAGE = 5` (`:7`).
`faelligAm = letzteKontrolle + 31 Tage` (`:22`), `tageBisFaellig` aufgerundet (`:23`). **Noch nie
geprüft → `ampel: "rot"`, `ueberfaellig: false`, `nieGeprueft: true`** (`:19-21`). Das ist die Falle
dieser Funktion: `ueberfaellig === false` heißt hier **nicht** „alles gut". Jede Anzeige muss
`nieGeprueft` eigenständig behandeln, sonst zeigt ein nie kontrolliertes Gerät „nicht überfällig"
neben einer roten Ampel.

Die Rechnung ist **reine Millisekunden-Arithmetik** (`:22-23`) — im Gegensatz zu `verfall.ts` und
`geraet.ts` hängt sie **nicht** an der Zeitzone (§5.16).

**Bewertung einer Kontrolle** (`bewerteKontrolle`, `:54-79`). `imBereich(wert, min, max)` liefert
`null`, wenn irgendein Wert fehlt (`:33-36`). `bestanden` nach drei Regeln (`:70-77`):

1. **Kein einziger Wert erfasst → `false`.** Das verhindert „vacuously true": eine leere Kontrolle
   ist keine bestandene (`:48`, `:71-72`).
2. **Mindestens ein Level konfiguriert** (min **und** max gesetzt) → **alle** konfigurierten Level
   müssen gemessen **und** im Bereich sein (`:73-74`).
3. **Kein Level konfiguriert, aber ein Wert erfasst → `true`** (`:75-76`) — es gibt keinen
   Referenzbereich zu verletzen.

Kompressen-Verfall, Sticks, Lanzetten und Batteriewechsel fließen **nicht** in `bestanden` ein
(`:52`). Übernahme 1:1, inklusive dieser Ausschlussliste als Kommentar.

**`refSnapshot` ist geschrieben und wird nie gelesen.** Nachgeprüft: `grep -rn refSnapshot src/`
liefert außerhalb von Tests nur die Schreibstelle (`bz.ts:115`, `:143`) und die Spaltendefinition
(`schema.ts:213`). Die Zusage „nachweisfester Snapshot der Referenzbereiche zum Messzeitpunkt"
(`schema.ts:212`) existiert damit als Datum, nicht als Aussage — dieselbe Klasse wie
`BESTELL_FAKTOR`, nur andersherum: geschrieben, nie gelesen. **Entschieden:** die Spalte bleibt (sie
ist der einzige Nachweis, wenn jemand die Referenzbereiche am Gerät später ändert) **und wird
sichtbar** — das Logbuch zeigt je Zeile die damals gültigen Grenzen aus `refSnapshot`, nicht die
heutigen aus `bz_geraete`. Ohne das liest man eine alte Kontrolle gegen einen neuen Referenzbereich,
und das ist die Fehlaussage, die ein Nachweis nicht machen darf.

**Akku-Lebensdauer** (`akkuLebensdauer`, `:88-96`): Mittel der Abstände zwischen aufeinanderfolgenden
Batteriewechsel-Ereignissen. `< 2` Wechsel → `tageDurchschnitt: null` (kein Intervall messbar,
`:92`). Die Gesamtkennzahl über alle Geräte mittelt **nur geräteinterne** Intervalle
(`src/db/bz.ts:137-161`) — sie klebt nicht die Zeitreihen verschiedener Geräte aneinander.

---

### 5.12 Sauerstoff — Nennfülldruck, Füllstand, Ampel

`src/lib/domain/o2.ts`:

```
fuellstandProzent(druckBar, nennfuelldruckBar) = nenn <= 0 ? 0 : round(druck / nenn * 100)   // :8-11
o2Status: prozent < 25 → rot · < 50 → gelb · sonst "gruen"                                   // :4-5, :19-21
niedrig := ampel === "rot"                                                                   // :22
```

Vier Eigenschaften, die 1:1 mitgehen:

1. **Nicht auf 100 geklemmt** (`:7`) — Überfüllung bleibt sichtbar. Ein `Progress`, der bei 100
   deckelt, verliert diese Aussage.
2. **`nenn <= 0` → 0 %**, kein Fehler und keine Division durch null (`:9`).
3. **Vorgabe-Nennfülldruck ist 200 bar** (`schema.ts:242`, `sauerstoff.ts:14`).
4. **Keine Messung → `status: null`**, nicht `0 %` (`src/db/sauerstoff.ts:50-51`, `:74`). Die
   Oberfläche zeigt „keine Messung", nicht eine leere rote Ampel. Das ist einer der Fehlerzustände
   aus §11.5.

**Der aktuelle Druck ist immer die jüngste Messung** (`src/db/sauerstoff.ts:31-36`, `:70`) — es gibt
kein denormalisiertes Feld. Damit ist eine falsche Messung **durch eine neue korrigierbar**, ohne die
alte anzufassen.

**Ein `?? 200`-Rückfall mit stiller Wirkung — und er ist auf zwei verschiedenen Wegen erreichbar.**
Für eine 300-bar-Flasche skaliert der Rückfall den Füllstand still falsch: 150 bar erscheinen als
**75 %** statt der wahren **50 %**, und die Ampel springt damit von „gelb" auf „grün". Die beiden
Leser fallen unterschiedlich weit zurück:

| Beleg | Kette | Erreichbar wenn |
|---|---|---|
| Check-**Historie**, `queries.ts:380` | `f.nennfuelldruckBar ?? 200` — `f` ist der **JSON-Eintrag**, es gibt **keinen** Rückgriff auf den Flaschenstamm | der Snapshot fehlt im Ergebnis-JSON. Das trifft **jeden** Check, der vor der Einführung des Snapshots (`check.ts:147`) abgeschlossen wurde, und jedes teilweise geschriebene Ergebnis |
| Check-**Detail**, `queries.ts:470` | `e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? 200` — zweites Glied ist der Flaschenstamm | Snapshot fehlt **und** die Flasche ist inzwischen gelöscht (`f?`) |

Die Historie ist damit **deutlich leichter** in den Rückfall zu bringen als das Detail — und sie ist
genau die Ansicht, die `flaschenAuffaellig` je Check zählt. Ein Altcheck über 300-bar-Flaschen meldet
dort systematisch zu wenige auffällige Flaschen.

**Entschieden:** der Rückfall wird **benannt statt geraten**, in **beiden** Lesern. Fehlt der Wert in
allen verfügbaren Quellen, liefert die Zeile `nennfuelldruckBar: null`, `prozent: null`,
`ampel: null` und die Anzeige „Nennfülldruck unbekannt" — **keine** Prozentzahl und **keine** Ampel;
solche Zeilen zählen **nicht** in `flaschenAuffaellig`, sondern in einen eigenen Zähler
„nicht bewertbar". Zusätzlich bekommt die Historie dieselbe Stammdaten-Kette wie das Detail
(`e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null`), damit der häufigere der beiden Wege
überhaupt erst den seltenen erreicht. Ein unbekannter Bezugswert erzeugt keine Zahl.

#### Entscheidung 5 — Trigger auf `bz_kontrollen`, nicht auf `o2_messungen`

**Entschieden: Variante (c).** Heute trägt nur `buchungen` Trigger
(`drizzle/0001_append_only.sql:1-11`); die Append-only-Zusage von `bz_kontrollen` und `o2_messungen`
steht ausschließlich als Kommentar im Code (`src/actions/sauerstoff.ts:51`, `src/actions/bz.ts:91`)
und ist damit weder erzwungen noch überprüfbar. Die vollständige Begründung — einschließlich der
Prüfung, dass kein Pfad `bz_kontrollen` ändert oder löscht, und einschließlich des Gegenarguments,
das für `o2_messungen` **nicht** trägt — steht in §4.4.

⚠️ **Der Zusammenhang, der hier entsteht und den man leicht übersieht:** die beiden Zähler dieses
Abschnitts — `flaschenAuffaellig` und der neue „nicht bewertbar" — sind der Grund, warum
`o2_messungen` korrigierbar bleiben muss. Eine per Vorbelegung entstandene Zeile aus Falle 8 (§5.8.1)
fällt in **keinen** der beiden Zweige: sie sieht plausibel aus und zählt als bewertet. Ein Trigger
zementierte sie.

**Zwei Randbedingungen, die daraus in den Import gehen** (§4.4): `INSERT OR IGNORE` bzw.
`onConflictDoNothing` als Wiederholstrategie; **`INSERT OR REPLACE` ist die Falle**.

---

### 5.13 Suche und Filter

#### 5.13.1 Der Bestand: zwei Regime

**Regime A — clientseitig über eine vollständig geladene Liste.** Sechs Listen filtern in `useMemo`
im Browser; der Zustand lebt in `useState`, überlebt kein Neuladen und steht in keiner URL. **Die
Suchfeldmengen sind je Liste verschieden, und das ist Bedienpraxis, keine Nachlässigkeit** — nach
einem Barcode sucht man bei Geräten, nach einer Kennung bei Fahrzeugen, nach einer Chargennummer bei
Artikeln:

| Liste | Freitext sucht über | Chips |
|---|---|---|
| `ArtikelTable.tsx:118` | Name · Fach · Chargennummer der nächsten Charge | unter Mindestbestand · Charge kritisch · inaktive ausblenden |
| `GeraeteListe.tsx:16-24` | Name · Barcode · Lagerort | Medizin · Objekt (Mehrfach) · nur fällige · inaktive ausblenden |
| `BzListe.tsx:22-30` | Name · Barcode · Lagerort | fällig/überfällig · inaktive ausblenden |
| `SauerstoffListe.tsx:15-23` | Name · Lagerort | niedriger Druck · inaktive ausblenden |
| `FahrzeugeListe.tsx:16-25` | Name · Kennung | unter Soll · läuft ab · inaktive ausblenden |
| `TokenTable.tsx:28-35` | Code · Label · Zielname | gesperrt · Fahrzeug · Artikel · Artikel-Liste (Mehrfach) |

Dazu `HelferListe.tsx:10-12` (nur Artikelname) und `Combobox.tsx:74` (`label` **plus** ein optionales
`keywords`-Feld).

**Regime B — serverseitig, Zustand in `searchParams`.** `/verwaltung/journal` (`q`, `typ`, `von`,
`bis`) und `/verwaltung/checks` (`fz`, `von`, `bis`). Die `WHERE`-Bedingungen greifen **vor** dem
`LIMIT` (`queries.ts:82-85`, `:105-111`), die Suche geht also über die gesamte Historie und liefert
davon die neuesten Treffer.

#### 5.13.2 Die Ungleichheit — und die Entscheidung, sie zu heilen

`journalEintraege` sucht einen Begriff über **zwei** Wege und ODER-verknüpft sie
(`queries.ts:95-102`):

- **Artikelname in JavaScript:** `a.name.toLowerCase().includes(term.toLowerCase())` (`:97`); die
  Treffer-IDs gehen als `inArray` in die Abfrage (`:101`). `String.prototype.toLowerCase` ist
  **unicode-fähig**.
- **Kommentar in SQL:** `LIKE '%…%' ESCAPE '\'` (`:100`), mit vorherigem Escapen von `%`, `_`, `\`
  (`:99`). SQLites eingebautes `LIKE` faltet **nur A–Z**.

Die Re-Kritik hat das gegen `better-sqlite3` 12.11.1 nachgemessen: die Hälften laufen genau dann
auseinander, wenn der Begriff einen **Nicht-ASCII-Buchstaben** enthält, dessen Groß-/Kleinschreibung
sich vom gespeicherten Text unterscheidet. Reine ASCII-Begriffe verhalten sich identisch. `PÄCKCHEN`
findet den Artikel und verliert jeden Kommentar, der `Päckchen` normal schreibt — **ohne
Rückmeldung**, die Seite zeigt einfach weniger Zeilen.

**Entschieden: die Ungleichheit wird geheilt, indem beide Hälften dieselbe Faltung benutzen.**

Der Rahmen, der die Entscheidung entscheidet: **jede Heilung, die gespeicherten Text auf `buchungen`
anfasst, ist eine Trigger- und Migrationsfrage** — eine normalisierte Spalte bräuchte einen Backfill,
und Backfill heißt `UPDATE buchungen`, was am Append-only-Trigger abbricht. Eine **generierte**
Spalte scheidet aus, weil SQLite darin keine benutzerdefinierten Funktionen zulässt und das
eingebaute `lower()` ebenfalls nur ASCII faltet. Es bleibt genau ein Weg, der nichts speichert:
**die Faltung als benutzerdefinierte SQL-Funktion zur Abfragezeit.**

```ts
// _lib/suche.ts  — kein "use client"
export const falte = (s: string): string => s.toLowerCase();
```

```ts
// _db/client.ts — der modul-eigene Zugriff, damit die Funktion registriert werden kann
import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { falte } from "../_lib/suche";

/**
 * WARUM lagerbuch NICHT `getModuleDb` benutzt: `journalEintraege` sucht ueber
 * zwei Haelften (JS-Artikelname, SQL-Kommentar), und die Haelften falten heute
 * verschieden (§5.13.2). Die einzige Heilung, die NICHTS speichert — und damit
 * am Append-only-Trigger vorbeikommt —, ist eine benutzerdefinierte
 * SQLite-Funktion zur Abfragezeit. `openModuleDatabase` bietet dafuer keinen
 * Haken, und eine core-Erweiterung haette heute KEINEN zweiten Nutzniesser.
 *
 * DER CACHE-SCHLUESSEL IST DERSELBE, den `getModuleDb` benutzt
 * (`globalThis.__suiteDb["lagerbuch"]`, core/db/index.ts:25-35). Das ist die
 * eigentliche Absicherung gegen zwei Verbindungen auf dieselbe WAL-Datei: ein
 * spaeter hinzugefuegtes `getModuleDb("lagerbuch", schema)` faende den
 * vorhandenen Eintrag MIT registrierter Funktion vor, statt eine zweite
 * Verbindung ohne sie zu oeffnen. Der Quelltext-Scan aus §3.8.2 bleibt
 * trotzdem — er haelt die Bauform fest, aber er ist nicht mehr die einzige
 * Absicherung.
 */
const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };

export function getDb() {
  g.__suiteDb ??= {};
  if (!g.__suiteDb["lagerbuch"]) {
    const sqlite = openModuleDatabase(moduleDbPath("lagerbuch"));
    sqlite.function("lb_falte", { deterministic: true },
      (v: string | null) => (v === null ? null : falte(v)));
    g.__suiteDb["lagerbuch"] = drizzle(sqlite, { schema });
  }
  return g.__suiteDb["lagerbuch"] as ReturnType<typeof drizzle<typeof schema>>;
}
```

```ts
// im Journal-Prädikat
const norm = falte(term);
const escaped = norm.replace(/[\\%_]/g, (c) => `\\${c}`);
const textConds: SQL[] = [sql`lb_falte(${buchungen.kommentar}) LIKE ${`%${escaped}%`} ESCAPE '\\'`];
const treffer = alleArtikel.filter((a) => falte(a.name).includes(norm)).map((a) => a.id);
if (treffer.length > 0) textConds.push(inArray(buchungen.artikelId, treffer));
```

**Was das kostet:**

- **Ein modul-eigener Opener in `_db/client.ts`** statt `getModuleDb`. Er benutzt dieselbe
  `openModuleDatabase`-Funktion und erbt damit die vier Pragmas unverändert (§4.1); er ergänzt allein
  `lb_falte` und den Cache-Eintrag.
- **Die Zwei-Verbindungs-Gefahr wird geschlossen, nicht abgegeben** — dreifach. Erstens durch den
  geteilten Cache-Schlüssel (siehe Kommentar oben). Zweitens durch die Auslassung in
  `seedAllModules()`: nachgeprüft am Arbeitsbaum ist das die **einzige** `core`-Stelle, die
  `getModuleDb(<key>, schema)` ruft — `migrateAllModules` (`core/bootstrap.ts:54-59`) öffnet eine
  eigene, schema-freie Verbindung und schließt sie wieder, und `core/health` (`:4-16`) tut dasselbe
  und fährt nur `SELECT 1`. Drittens durch den Quelltext-Scan aus §3.8.2.
  **Trägt diese Rahmung nicht, ist der benannte Rückfall Entscheidung (a): die Ungleichheit 1:1
  übernehmen und ausschreiben** — nicht eine halb gebaute UDF.
- **Laufzeit: nahe null.** `LIKE '%…%'` konnte nie einen Index benutzen; die Abfrage war schon ein
  Scan. Hinzu kommt eine C↔JS-Grenzüberquerung je gescannter Zeile mit nicht-leerem Kommentar — bei
  100 000 Zeilen rund 30–80 ms, **und nur, wenn überhaupt ein Suchbegriff gesetzt ist**. Die rechte
  Seite ist konstant und wird bei `deterministic: true` einmal ausgewertet.
- **Testbarkeit steigt.** Weil beide Hälften dieselbe Funktion benutzen, gibt es einen
  Differenztest, den es heute nicht geben kann (§5.19).

**Was ausdrücklich nicht geheilt wird: `ß`/`ss`.** Gemessen ist `'Straße' LIKE '%STRASSE%'` → 0, und
`"STRASSE".toLowerCase()` ist `"strasse"`, was in `"straße"` nicht vorkommt.
Das ist **keine Divergenz zwischen den Hälften**, sondern eine gemeinsame Lücke, und sie bleibt: eine
Normalisierung, die `ß` auf `ss` faltet, erzeugt Treffer, die der Nutzer nicht gesucht hat
(„Massen"/„Maßen"), und ist damit teurer als das Problem.

#### 5.13.3 Was beim Umbau auf antd still verlorengeht

Vier Zusicherungen aus Regime A haben in antd **kein** Gegenstück und sind einzeln zu portieren.
⚠️ **Das sind Auflagen an §6** (§6.15, Auflagen 7–10) und dort eingelöst: §6.9.4 (die sechs
Feldmengen und die Sortierungen), §6.9.5 (Trefferanzeige und Excel-Export), §6.4.3 (`filterOption`):

1. **Die sechs verschiedenen Suchfeldmengen.** Ein `Table` mit einem globalen Suchfeld bringt sie
   nicht mit.
2. **Die Trefferanzeige.** `Filterleiste.tsx:131` rendert „X von Y" **nur**, wenn
   `gezeigt !== gesamt`. Ein `Table`-Pager sagt etwas anderes. Alle sechs Listen geben sie mit.
3. **Der Excel-Export hängt am Filterzustand.** `ArtikelTable.tsx:133` ruft
   `bestandExportZeilen(gefiltert)`; die Datei enthält „genau das, was gerade in der Tabelle steht
   (Suche, Filter, Sortierung)" (`:124-125`). Wandert Filtern und Sortieren in antds `Table`-eigenen
   Zustand, muss der Export **dieselbe abgeleitete Liste** lesen — sonst exportiert der Knopf still
   wieder alles (§9.4).
4. **`Select showSearch` kennt das `keywords`-Feld nicht.** `Combobox.tsx:74` sucht über
   `label + keywords`; fünf Aufrufstellen machen damit etwas suchbar, das nicht im Beschriftungstext
   steht: das Kennzeichen eines Fahrzeugs (`ChecksFilter.tsx:27`), das Fach eines Artikels
   (`SollEditor.tsx:93`, `TemplatePosEditor.tsx:74`), Fahrzeugname und Chargennummer
   (`ArtikelDrawer.tsx:261`, `:285`). Ohne ausdrückliches `optionFilterProp`/`filterOption` fällt das
   beim Tausch **still** weg — man tippt ein Kennzeichen und findet nichts.

**Verbindlich:** jedes `Table` setzt `pagination` ausdrücklich (alle zehn `Table`-Aufrufe der Suite
tun das; kein Aufruf verlässt sich auf den Vorgabewert), und die Trefferanzeige bleibt als eigene
Komponente erhalten.

---

### 5.14 Der URL-State-Vertrag und die zwei stillen Deckel

#### 5.14.1 Die Parameter

⚠️ **Annahme:** die Parameternamen sind verbindlich und werden wörtlich übernommen. Der Betreiber
hat Frage 35 nicht beantwortet; im Repo sind sie genau einmal gebunden (`e2e/suche-filter.spec.ts:30`
prüft literal `toHaveURL(/[?&]q=Verband/)`). **Die Kosten des Behaltens sind null, die Kosten des
Umbenennens sind gebrochene Lesezeichen und Runbook-Links, die niemand einsammeln kann.** Also:

| Route | Parameter | Prüfung |
|---|---|---|
| `/verwaltung/journal` | `q`, `typ`, `von`, `bis` | `typ` gegen Weißliste (`journal/page.tsx:8`, `:17`), `q` nur `trim()` (`:16`) |
| `/verwaltung/checks` | `fz`, `von`, `bis` | `fz` gegen die tatsächliche Flotte aus der Datenbank (`checks/page.tsx:20`) |
| `/helfer/check` | `fz` | gegen die aktive Flotte (`helfer/check/page.tsx:28`, §7.9.1) |

⚠️ **Die eine Ausnahme:** der Gate-Fehlerparameter heißt `grund` statt `err` (§3.9) — dort wächst der
Wertesatz von zwei auf vier, und ein Alt-Link mit `?err=` ist danach wirkungslos, aber nicht kaputt.

**Der `replace`-Vertrag bleibt.** `useUrlFilter` navigiert mit `router.replace`, nicht `push`
(`Filterleiste.tsx:34`). Keine Filteränderung erzeugt einen Verlaufseintrag; die Zurücktaste
verlässt die Seite. Das ist dieselbe Begründung, die die Suite an derselben Stelle bereits
aufgeschrieben hat (`m/feedback/_ui/Segment.tsx:15-16`). **Wer den Zurück-Knopf „repariert" und auf
`push` umstellt, bekommt zusammen mit dem 300-ms-Debounce der Freitextsuche
(`JournalFilter.tsx:48-51`) einen Verlaufseintrag pro Tipppause.**

**Der `committedQ`-Tanz geht mit.** `JournalFilter.tsx:29-36` merkt sich in einem Ref, welchen
Suchbegriff die Komponente zuletzt selbst in die URL geschrieben hat, und unterscheidet damit eine
**externe** `q`-Änderung (geteilter Link) von einer selbst ausgelösten: extern wird die Eingabe
nachgezogen, selbst ausgelöst passiert nichts — sonst verlöre das Feld beim Tippen den Fokus. Ein
antd-`Input` bringt das nicht mit. **`useUrlFilter` wird als **eine** Modulhilfe geführt** und wird
nicht in jeder Filterleiste nachgebaut. ⚠️ **Korrigiert gegenüber einer früheren Fassung dieses
Absatzes: die Datei liegt in `_ui/`, nicht in `_lib/`** — sie ruft `useRouter`/`usePathname` und
**muss** deshalb ein Client-Modul sein, und die `_lib/`-Regel („kein `"use client"` in diesem
Ordner", Falle 6) bleibt hart. §2.1 führt sie mit dieser Begründung unter `_ui/`, §6.3.4 nennt sie
als die eine erlaubte `usePathname`-Fundstelle des Moduls. Im gesamten `src/app/m` der Suite gibt es
kein Vorbild für
eine mehrteilige, debouncte Filterleiste (die zwei vorhandenen Fälle setzen **einen** skalaren
Parameter über einen Klick).

#### 5.14.2 Die Prüf-Asymmetrie — heute still, ab jetzt sichtbar

`von`/`bis` gehen heute **ungeprüft** durch (`journal/page.tsx:18-19`, `checks/page.tsx:21-22`).
`parseDatumGrenze` (`format.ts:21-26`) liefert bei Unsinn `undefined`, die Abfrage ignoriert die
Grenze — aber die **rohe** Zeichenkette wandert als Prop zurück in den Client
(`journal/page.tsx:34`) und dort in `value=` eines Datumsfelds (`Filterleiste.tsx:57`, `:68`).

**Das Fehlverhalten ist das gefährliche, nicht das laute:** ein gespeicherter Link mit defektem `von`
liefert die Seite ohne Fehlermeldung und **ungefiltert**. Die Adresszeile zeigt einen Zeitraum, das
Datumsfeld steht leer, und die Liste zeigt die neuesten 100 Buchungen aus der ganzen Historie. Wer den
Link für einen gespeicherten Zeitraumbericht hält, liest die falsche Menge.

**Entschieden:** die Grenzen werden serverseitig geprüft, und **jede verworfene Grenze wird
angezeigt**:

```ts
// _lib/format.ts — die Zonenrechnung selbst kommt aus _lib/zeit.ts#tagesGrenzen (§4.5)
export type Zeitraum = { von?: Date; bis?: Date; hinweise: string[] };
export function zeitraumAus(vonRoh?: string, bisRoh?: string): Zeitraum
// - unparsbar / kein YYYY-MM-DD  -> Grenze fällt weg + "Das Datum in der Adresse ist ungültig und wurde ignoriert."
// - von > bis                    -> beide bleiben + "Der Zeitraum ist leer: 'von' liegt nach 'bis'."
// - gültig                       -> tagesGrenzen(): Tagesanfang (von) bzw. Tagesende (bis), inklusiv, in ZEITZONE
```

Die Hinweise erscheinen als Text **an der Filterleiste**, nicht als Fehlerseite; die roh
zurückgereichte Zeichenkette wird durch den normalisierten Wert ersetzt, damit Adresszeile und
Eingabefeld dasselbe sagen.

#### 5.14.3 Die harte 100-Zeilen-Grenze

Drei Deckel, alles Vorgabewerte, die **kein Aufrufer je überschreibt**:

| Deckel | Beleg | Konstante |
|---|---|---|
| Journal: **100** | `queries.ts:87` | `JOURNAL_GRENZE` in `_lib/grenzen.ts` (§10.3) |
| Check-Historie: **50** | `queries.ts:350` | `CHECK_GRENZE` |
| BZ-Logbuch (gesamt): **100** | `src/db/bz.ts:124` | `BZ_LOGBUCH_GRENZE` |

**Sichtbar ist davon fast nichts.** `journal/page.tsx:32` schreibt „Zeigt die neuesten 100 Treffer"
**unbedingt** in die Seitenbeschreibung — auch wenn drei Zeilen zurückkommen. Die Checks-Seite nennt
ihre 50 an keiner Stelle. Und die Trefferanzeige aus `Filterleiste.tsx:131` erscheint auf **keiner**
der beiden Seiten (`JournalFilter.tsx` übergibt die `treffer`-Prop nicht, `ChecksFilter.tsx`
verwendet die `Filterleiste` gar nicht). **Es gibt heute im gesamten Modul keinen Weg
herauszufinden, ob eine Grenze gerade zugeschlagen hat.**

**Entschieden (Entscheidung 35, Option a):** die Deckel bleiben bei 100/50/100 (sie sind der Grund,
warum die Seiten bei wachsendem Journal nicht linear langsamer werden), aber sie werden
**beobachtbar**:

1. Die Abfrage holt `GRENZE + 1` Zeilen und gibt `mehrVorhanden: boolean` zurück; angezeigt werden
   `GRENZE`.
2. Der Beschreibungstext ist **bedingt**: bei `mehrVorhanden` „Neueste 100 von mehr Treffern —
   Zeitraum eingrenzen", sonst „N Treffer".
3. Die drei Konstanten liegen in `_lib/grenzen.ts` (ohne `"use client"`), damit Abfrage und Text
   **denselben** Wert lesen. Heute stehen die 100 an zwei Stellen und können auseinanderlaufen.
   ⚠️ Sie sind **Konstanten, keine Env-Variablen** — Begründung in §10.3.

#### 5.14.4 Die Sortierung ist unbestimmt — und das fällt genau im Check auf

`journalEintraege` sortiert `orderBy(desc(buchungen.ts))` **ohne Tiebreaker** (`queries.ts:109`).
`buchungen.ts` ist `integer(..., {mode:"timestamp"})` und speichert damit **UNIX-Sekunden**, nicht
Millisekunden. Der Check-Abschluss schreibt Abgleich, Umlagerung und Messungen in einem Rutsch mit je
eigenem `new Date()` — **alle teilen sich denselben Sekundenwert**. Welche Zeile im Journal oben
steht, entscheidet danach die Datenbank.

**Entschieden:** `orderBy(desc(buchungen.ts), desc(buchungen.id))`, Index `idx_buchungen_ts_id`
(§4.14). `buchungen.id` ist ein `nanoid()` (`schema.ts:4`, `:92`), also **nicht** zeitlich geordnet —
der Tiebreaker liefert eine **totale** Ordnung, keine **kausale**. Das ist ehrlich zu sagen: er macht
die Anzeige reproduzierbar (dieselbe Anfrage liefert dieselbe Reihenfolge, auch über einen
Seitenwechsel hinweg), er stellt aber nicht her, dass „Abgleich vor Nachfüllung" steht. Wer die
tatsächliche Reihenfolge braucht, liest die gemeinsame `referenz` (`check:<id>`, `check.ts:86`) und
die `typ`-Werte. Dasselbe für `checkHistorie` (`orderBy(desc(completedAt), desc(id))`) und die beiden
BZ-/O2-Verläufe.

---

### 5.15 Wo eine Regel heute nur im Client steht

Diese Liste ist der teuerste Teil des Umbaus: **eine Regel, die nur in einer `"use client"`-Datei
steht, überlebt einen Oberflächen-Neubau nicht von selbst.** Keiner dieser Punkte wird von
`typecheck`, `lint`, `build` oder Vitest gefunden — Vitest strukturell nicht, weil `"use client"`
dort ein wirkungsloser String ist.

| # | Regel | Heute | Serverseitiger Gegenpart | Entscheidung |
|---|---|---|---|---|
| 1 | Zählschritt ist auf **Soll** vorbelegt | `CheckFlow.tsx:97` | **keiner** | bleibt Client, aber im Servertext von `checkAbschluss` als Vertrag kommentiert (§5.8.1) |
| 2 | Abschluss sendet **alle** Positionen | `CheckFlow.tsx:146` | **keiner** | bleibt (§5.8.1) |
| 3 | `ZUSTAENDE` + `zustandTone` | `CheckFlow.tsx:22-24` | **keiner**, Server nimmt freien String (`check.ts:35`) | **wandert nach `_lib/konstanten.ts`**, Zod-Enum (§5.8.2) |
| 4 | Geräte-Vorbelegung `vorhanden: true`, `zustand: "In Ordnung"` | `CheckFlow.tsx:25` | keiner | bleibt Client; Herkunft wird sichtbar (§5.8.1) |
| 5 | Alle Geräte/Flaschen werden gesendet | `CheckFlow.tsx:147`, `:151` | Zugehörigkeit wird geprüft (`check.ts:128`, `:139`), Vollständigkeit nicht | bleibt |
| 6 | Druck-Vorbelegung = Nennfülldruck | `CheckFlow.tsx:137` | keiner | bleibt; Messung wird als check-stammend gekennzeichnet |
| 7 | Nur **geänderte** Verfälle werden gesendet | `CheckFlow.tsx:153-155` | „fehlender Eintrag = unangetastet" (`check.ts:151-152`) | bleibt; der Server-Kommentar ist der Vertrag |
| 8 | Nachfüllmenge ≤ Lücke | `CheckFlow.tsx:461` (`max={luecke}`) | **ja**, `check.ts:95` klemmt serverseitig | Vorbild: so müssen die anderen aussehen |
| 9 | Zählwert ≤ 9999 | `CheckFlow.tsx:295`, `:402` | keiner (Server nimmt jeden nicht-negativen Int) | **Server bekommt einen Deckel** — eine vertippte Million erzeugt sonst eine Korrekturbuchung, die niemand rückgängig machen kann |
| 10 | Inventur sendet nur angefasste Positionen | `InventurForm.tsx:24-25` | keiner | bleibt; Begründung wandert mit (§5.9) |
| 11 | Sechs Listen-Suchfeldmengen | §5.13.1 | keiner | einzeln portieren (§6.9.4) |
| 12 | Sortiervorgaben (`name-asc`, sechs Sortierungen, Zweitkriterium Name) | `ArtikelTable.tsx:108`, `:30-36`, `:41` | keiner | einzeln portieren (§6.9.4, Punkt 3) |
| 13 | Excel-Export = gefilterte Liste | `ArtikelTable.tsx:133` | keiner | muss dieselbe abgeleitete Liste lesen (§5.13.3, §9.4) |
| 14 | Trefferanzeige nur bei `gezeigt !== gesamt` | `Filterleiste.tsx:131` | keiner | eigene Komponente |
| 15 | `router.replace` statt `push` | `Filterleiste.tsx:34` | — | bleibt, mit Begründung (§5.14.1) |
| 16 | `committedQ` + 300 ms Debounce | `JournalFilter.tsx:29-36`, `:47-51` | — | wandert als `_lib`-Hilfe mit |
| 17 | `Combobox` sucht über `label + keywords` | `Combobox.tsx:74` | keiner | `optionFilterProp` ausdrücklich setzen (§5.13.3) |

**Punkt 9 ist die einzige Zeile dieser Tabelle, die eine Verhaltensänderung ist**, und sie ist
begründet: es sind die Felder, an denen ein Tippfehler eine **irreversible** Zeile erzeugt (I1: kein
`UPDATE`, kein `DELETE`), und der Client-Deckel ist heute die einzige Bremse. Die Deckelung gilt
deshalb für **alle drei** heute unbegrenzten Mengenfelder, nicht nur für das eine — sonst fragt der
nächste Leser zu Recht, warum:

| Feld | heute | Client-Bremse | Server-Deckel |
|---|---|---|---|
| Check, gezähltes Ist (`check.ts:22`, `ist`) | `z.coerce.number().int().min(0)` | `CheckFlow.tsx:295` `max={9999}` | `.max(99_999)` |
| Check, abgelesener Druck (`check.ts:46`, `druckBar`) | `z.coerce.number().int().min(0)` | `CheckFlow.tsx:402` `max={9999}` | `.max(9_999)` — ein Manometer über 9 999 bar gibt es nicht |
| Inventur, gezähltes Ist (`inventur.ts:14`, `ist`) | `z.coerce.number().int().min(0)` | **keine** (`InventurForm` benutzt denselben `Stepper`, aber ohne `max`) | `.max(99_999)` |

Die vierte Mengenangabe, `nachfuellMenge` (`check.ts:25`), braucht **keinen** eigenen Deckel: sie
wird serverseitig ohnehin auf `max(0, soll − ist)` geklemmt (`check.ts:95`) und danach an der
Handlager-Verfügbarkeit gekappt (`umlagerung.ts:23-25`).

---

### 5.16 Zeitzone — welche Rechnung hängt woran

Die Entscheidung selbst steht in §4.5 (Entscheidung 26, Option b): **das Modul rechnet die Zone
explizit in `_lib/zeit.ts` und hängt nicht an der Prozess-`TZ`.** Für die Fachlogik zählt, welche
Rechnung überhaupt betroffen ist:

| Zivildatum-abhängig (Ortszeit) | Zeitzonen-unabhängig (reine ms-Arithmetik) |
|---|---|
| `verfall.ts:10` — Monatsende → `monatsEnde()` | `bz.ts:22-23` — `letzteKontrolle + 31·86 400 000` |
| `geraet.ts:37` — Tagesanfang → `startDesTages()` | `bz.ts:94` — Akku-Intervalle |
| `format.ts:14` — `fmtTs` → `zeit.ts#fmtTs` | `o2.ts:8-11` — reine Division |
| `format.ts:21-26` — inklusive Filtergrenzen → `zeit.ts#tagesGrenzen` | `bestand.ts`, `fefo.ts`, `vorschlag.ts`, `check.ts` — kein Datum |

**Der Schaden läge in der Anzeige, nicht in der Ampel.** Gemessen ergibt
`new Date(2026, 8, 0, 23,59,59,999)` unter Berlin `2026-08-31T21:59:59.999Z`, unter UTC
`2026-08-31T23:59:59.999Z` — unter UTC schnitte `verfall.ts:10` das Monatsende also **später**;
beide Ampelgrenzen wanderten in die harmlose Richtung. Was wirklich kaputtginge, ist `fmtTs`: eine
Buchung um 01:30 Ortszeit zeigte das Journal unter UTC als **Vortag, 23:30** — jede Buchung zwischen
00:00 und 02:00 landete auf dem falschen Tag. Dieselbe Klasse: die inklusiven Journal-Filtergrenzen
verschöben sich um ein bis zwei Stunden. **Unter Entscheidung 26 (b) tritt keiner dieser Fälle ein**,
weil keine dieser Rechnungen mehr die Prozessumgebung liest.

**`config.tz` ist tot.** `config.ts:35` parst `TZ`, `:73` legt es in `AppConfig` — gelesen wird es im
ganzen Repo nur von `config.test.ts:12`. Die wirksame Zeitzone kam schon immer allein aus der
Prozessumgebung. **Im Zielmodul gibt es kein `tz`-Feld**; dieselbe Streichung wie bei
`BESTELL_FAKTOR`, aus demselben Grund (§10.2).

⚠️ **Testauflage — und sie fällt anders aus, als sie zunächst aussieht.** `lagerbuch/vitest.config.ts:19`
nagelt `env: { TZ: "Europe/Berlin" }` für alle Unit-Tests fest; `iuk-suite/vitest.config.ts` hat
**gar keinen `env`-Block**. **Es wird trotzdem keiner eingezogen** (§12.6, Punkt 1): unter
Entscheidung 26 (b) trägt kein Test dieses Moduls mehr eine zonenabhängige Zusage, die ein Pin retten
müsste — im Gegenteil, `_lib/zeit.test.ts` verstellt `TZ` **absichtlich** und beweist damit die
Unabhängigkeit (§4.16). Ein globaler Pin änderte die Testsemantik der vier laufenden Module und wäre
genau die Klasse suiteweiten Risikos, die der Betreiber aus dieser Spec herausgenommen hat.

---

### 5.17 Ampel und Farbe — die Design-Falle, die dieses Modul mit voller Wucht trifft

`docs/design/README.md:53-56`: **`colorError === colorPrimary === #c8000f`.** Wo Rot zusätzlich eine
**fachliche** Bedeutung trägt, darf Rot **niemals auf einer Datenfläche** erscheinen. Dieses Modul
hat eine dreifarbige Ampel als Kernsprache — `Ampel = "rot" | "gelb" | "gruen"`
(`src/lib/domain/verfall.ts:1`) taucht in `verfallStatus`, `o2Status`, `datumFaelligkeit` und
`bzFaelligkeit` auf. Daraus drei bindende Sätze:

1. **Die Ampel ist eine fachsemantische Palette und liegt beim Modul**, nicht in
   `core/theme/tokens.ts` — dasselbe Muster wie die Schulnoten-Ampel in
   `m/feedback/_lib/noten.ts` (`docs/design/README.md:118-124`). Datei:
   `_lib/ampel.ts`, **ohne `"use client"`**.
2. **Suite-Rot ist Marke und Primäraktion, nie Statusfarbe.** Das Ampel-Rot ist ein **eigener**
   Hexwert aus der Modulpalette, nicht `colorError` und nicht `colorPrimary`. Ein `Alert
   type="error"` erscheint in diesem Modul **nirgends** neben einer Ampel; Warnungen sind
   `type="warning"` oder Text plus 3px linke Kante (§11.6).
3. **Bedeutung nie allein über Farbe.** Jeder Ampelzustand trägt Text. Der ist schon da:
   `chargeText` (`format.ts:29-34`) und `geraetFaelligChip` (`format.ts:50-65`) liefern ihn — sie
   werden mitportiert, nicht durch ein farbiges `Tag` ersetzt.

**Die Namensfalle geht mit.** `chipTone` (`format.ts:42-44`) bildet `"gruen"` auf `"ok"` ab, weil die
CSS-Klassen `chip-rot`/`chip-gelb`/`chip-ok` heißen — ein direkt interpoliertes `chip-${ampel}`
ergäbe ein undefiniertes `chip-gruen` mit Padding und Radius, aber ohne Farbe. Im Zielmodul heißt
die Funktion **`ampelTon`** und liefert `"rot" | "gelb" | "ok" | "grau"`; `"grau"` ist der vierte
Zustand für „kein Datum gepflegt" (`geraet.ts:35`) und „keine Messung" (`sauerstoff.ts:51`) — er ist
**kein** Ampelwert und darf nie als grün dargestellt werden. `chipTone` gibt es im Zielmodul nicht.

---

### 5.18 Fehlerzustände

Die vollständige, kapitelübergreifende Tabelle steht in **§11.5**. Sie ist dort und nicht hier, weil
die Zustände des Helfer-Wegs (§7.3) und die der Verwaltung dieselbe Form haben und an einer Stelle
stehen sollen. Für die Fachlogik gelten daraus vier Zeilen besonders:

- **Entnahme gebucht: 0** ist ein **Fehl**fall, kein Erfolg (§11.5, Zustand 8) — heute zeigt
  `HelferEntnahme.tsx:26-27,55` einen grünen Chip „Entnahme gebucht: 0 × X".
- **Nennfülldruck unbekannt** liefert `null` statt `?? 200` und zählt in „nicht bewertbar" (§5.12).
- **BZ nie geprüft** ist `ampel: "rot"` bei `ueberfaellig: false` — die Anzeige muss `nieGeprueft`
  eigenständig behandeln (§5.11).
- **Gerät ohne Datum** ist grau, nicht rot; bei `typ='objekt'` gibt es gar keinen Chip (§5.10).

**Eine fachliche Folge aus einem fremden Kapitel.** `quelleAufloeser` (`src/db/quelle.ts:12-25`) löst
`quelleTyp`/`quelleId` in einen Anzeigenamen auf und fällt bei unbekannter Kennung auf die **rohe
ID** zurück. Unter der gefilterten `users`-Übernahme aus §4.13 tritt das für historische Zeilen
**nicht** ein — sie finden ihre importierte Zeile. Es tritt für **neue** Zeilen ein, wenn
`merkeNutzer` eine Zeile ohne Namen und ohne E-Mail geschrieben hat; das ist der benannte
Defektzustand aus §4.13 (i), und er wird protokolliert statt hingenommen.

---

### 5.19 Testaufbau — wer welche Aussage besitzt

Die drei Ebenen und die suiteweiten Randbedingungen stehen in §12; hier stehen die Aussagen dieses
Kapitels.

#### 5.19.1 Unit (Vitest), reine Funktionen

| Datei | Besitzt die Aussage |
|---|---|
| `_lib/domain/bestand.test.ts` | die vier Begriffe aus §5.2.1; **dieselbe `chargeId` an zwei Lagerorten** wird von `bestandProLagerortUndCharge` getrennt geführt (die Konstellation aus `bestand.ts:22-24`); ein Artikel ohne Buchungen liefert `0`, nicht `undefined` |
| `_lib/domain/fefo.test.ts` | aufsteigender Verfall; Rest ≤ 0 wird übersprungen; Anforderung > Bestand liefert eine **kürzere** Verteilung; negative Menge → leer; **gleicher Verfall → ältere `createdAt` zuerst, dann `chargeId`** (die neue Determinismus-Zusage aus §5.3.1) |
| `_lib/domain/verfall.test.ts` | Monatsende ist der letzte Tag, 23:59:59.999 **in ZEITZONE**; `tage` aufgerundet; die drei Ampelschwellen an ihren Kanten (`tage === kritisch` ist rot, `=== faellig` ist gelb); `abgelaufen` unabhängig von `ampel`; `PSEUDO_VERFALL` ist grün |
| `_lib/domain/vorschlag.test.ts` | `braucht` ist **strikt** kleiner; `vorschlagsmenge` nie negativ; Gleichstand → 0 und nicht in der Liste |
| `_lib/domain/o2.test.ts` | `nenn <= 0` → 0 %; **nicht** auf 100 geklemmt; die zwei Schwellen an ihren Kanten (24 → rot, 25 → gelb, 49 → gelb, 50 → grün) |
| `_lib/domain/geraet.test.ts` | `"2026-02-31"` → `keinDatum`; heute = 0; gestern = −1 und `ueberfaellig`; `keinDatum` liefert Ampel grün **und** `ueberfaellig: false` (die Kombination, die eine Anzeige leicht falsch liest) |
| `_lib/domain/bz.test.ts` | `null` → `nieGeprueft` **mit** `ueberfaellig: false`; die drei `bestanden`-Regeln inkl. „leere Kontrolle ist nicht bestanden"; ein konfiguriertes, aber **nicht gemessenes** Level lässt `bestanden` fallen; `akkuLebensdauer` mit 0/1/2/3 Wechseln |
| `_lib/domain/check.test.ts` | `fehlmengen` nur `> 0`; **`summiereCheckErgebnis` liefert für dasselbe JSON in Übersicht und Detail identische Summen** (die Doppelrechnung aus §5.8.3), inklusive des Zählers „nicht bewertbar" |
| `_lib/suche.test.ts` | `falte` ist locale-unabhängig; `%`, `_`, `\` werden wörtlich behandelt (heute `queries.ts:99`) |
| `_lib/format.test.ts` | `chargeText` in allen vier Zuständen; `geraetFaelligChip` liefert bei `objekt` **ohne** Datum `null`; `ampelTon` bildet `gruen` auf `ok` ab (die Falle aus `format.ts:36-41`); `zeitraumAus` in den vier Fällen aus §5.14.2. **`fmtTs` existiert heute ohne Testdatei** — die Lücke schließt `_lib/zeit.test.ts` (§4.16) |
| `_lib/artikelFilter.test.ts` | das aus `ArtikelTable.tsx:112-123` gehobene Prädikat, mit je einem Fall für Name, Fach und Chargennummer |
| `_lib/journalZeile.test.ts` | Vorzeichen und Zustandsname (`negativ`) einer Journalzeile — **ohne einen einzigen Hexwert** (§12.1, Punkt 4) |
| `_lib/checkNutzlast.test.ts` | aus Zählwerten und gemeldeten Verfällen entsteht diese Nutzlast, inklusive der Vorbelegung `ist[p.id] ?? p.soll` und der Zählung der ablaufenden Positionen (§12.1, Punkt 1) |

#### 5.19.2 Gegen eine echte SQLite-Datei (Vitest), weil ein Mock die Aussage nicht trägt

| Datei | Besitzt die Aussage |
|---|---|
| `_db/append-only.test.ts` | §4.16, Punkt 2 — inklusive der Gegenprobe, dass `o2_messungen` `UPDATE`/`DELETE` **erlaubt** |
| `_db/aggregate.test.ts` | **der Differenztest aus §5.2.4**: für einen Zeilenbestand mit drei Lagerorten und einer Charge, die an zweien liegt, liefern `bestandJeArtikel`/`restJeCharge` **exakt** dieselben Zahlen wie `bestandProLagerort`/`bestandProLagerortUndCharge` über die Vollladung |
| `_db/suche.test.ts` | **der Differenztest aus §5.13.2**: für einen Korpus mit `Verbandpäckchen`, `Nachschub Päckchen geliefert`, `NACHSCHUB PÄCKCHEN` und `Straße` liefern die JS-Hälfte und die `lb_falte`-Hälfte **dieselbe** Trefferentscheidung. Mit `PÄCKCHEN` in Großschreibung — dem Fall, der heute bricht. Und die ausdrückliche Gegenprobe: `ß`/`ss` findet **in beiden** Hälften nichts |
| `_db/fefo.test.ts` | zwei Chargen mit **gleichem** Verfall werden in `createdAt`-Reihenfolge verbraucht (der Determinismus aus §5.3.1) — gegen eine echte Verbindung, weil genau hier heute die DB-Rückgabereihenfolge entscheidet |
| `_db/check-abschluss.test.ts` | **die entstandenen Buchungen**, nicht nur der Rückgabewert: derselbe Artikel in **zwei Fächern** erzeugt **eine** Korrektur und **eine** Umlagerung, nicht zwei; `bestandProLagerort(fahrzeug) === istSumme` nach dem Abgleich (I4); Netto beider Umlagerungs-Legs = 0 (I3); leeres Handlager → `offen > 0` und **kein** negativer Handlager-Bestand (I2) |
| `_db/inventur.test.ts` | `diff === 0` schreibt **nichts**; `diff > 0` trifft die jüngste Charge; ohne Charge entsteht genau **eine** Pseudo-Charge |
| `_db/template-sync.test.ts` | die vier Regeln aus §5.7.2 einzeln, plus: Lösen verwirft Grabsteine und behält materialisierte Zeilen |
| `_db/migrations.test.ts` | §4.16, Punkt 1 |
| `_db/client.test.ts` | die Quelltext-Zusicherung „kein `getModuleDb("lagerbuch"` im Repo" (§3.8.2) und: `getDb()` zweimal gerufen liefert **dasselbe** Handle, und `SELECT lb_falte('Ä')` liefert `'ä'` |

#### 5.19.3 Alt-Defekt → der Test, der ihn fängt

Ohne diese Tabelle wären die Zusagen dieses Kapitels Absichtserklärungen: die Mutationsprobe bliebe
grün.

| Zusage | Mutation, die heute grün bliebe | Test |
|---|---|---|
| FEFO ist deterministisch (§5.3.1) | die Zweitsortierung entfernen | `_db/fefo.test.ts`, zwei Chargen gleichen Verfalls |
| Beide Suchhälften falten gleich (§5.13.2) | `lb_falte` durch die rohe Spalte ersetzen | `_db/suche.test.ts` mit `PÄCKCHEN` |
| Der Deckel ist erkennbar (§5.14.3) | `GRENZE + 1` auf `GRENZE` zurücksetzen | Abfragetest: 101 Zeilen → `mehrVorhanden === true`, 100 Zeilen → `false` |
| `von > bis` ist sichtbar (§5.14.2) | die Prüfung entfernen | `zeitraumAus`-Test: Hinweisliste ist **nicht** leer |
| Kein negativer Bestand (I2) | die Kappung in `fefoVerteilung` entfernen | `_db/check-abschluss.test.ts` mit leerem Handlager |
| Umlagerung ist netto null (I3) | Ziel-Leg aus `menge` statt `teile[]` (die Zeile, vor der `umlagerung.ts:26` warnt) | Summe **aller** Buchungen des Artikels vor/nach der Umlagerung ist gleich |
| Der Zugang prüft die Chargenzugehörigkeit (I5) | die Prüfung `buchung.ts:33-36` entfernen | Action-Test: fremde `chargeId` → Ablehnung, **keine** Zeile geschrieben |
| `zustand` ist ein Enum (§5.8.2) | zurück auf `z.string()` | Action-Test: `"kaputt"` → Ablehnung; und ein Altcheck mit fremdem String zählt **nicht** als auffällig |
| Die drei Mengenfelder sind gedeckelt (§5.15, Punkt 9) | ein `.max()` entfernen | drei Action-Tests: Check-Ist `1_000_000` → Ablehnung, Check-Druck `10_000` → Ablehnung, Inventur-Ist `1_000_000` → Ablehnung |
| `lb_falte` steht auf **jeder** lagerbuch-Verbindung (§5.13.2) | irgendwo `getModuleDb("lagerbuch", schema)` aufrufen | Quelltext-Zusicherung in `_db/client.test.ts` |
| Der Nennfülldruck wird nicht geraten (§5.12) | den `?? null` in Historie/Detail wieder auf `?? 200` setzen | Lesepfad-Test mit einem Ergebnis-JSON **ohne** `nennfuelldruckBar`: `prozent === null`, `ampel === null`, und die Zeile zählt **nicht** in `flaschenAuffaellig` |
| Die Pseudo-Charge wird über `verfall` erkannt (§5.3.2) | `istOhneVerfall` auf die Chargennummer umstellen | drei Chargen mit den drei Nummern → alle drei erkannt |

#### 5.19.4 Was NUR Playwright belegen kann

- **Ein durchgeklickter Fahrzeug-Check erzeugt die erwarteten Buchungen.** Das ist die Zusage, die
  `check.test.ts` heute **nicht** hat (es prüft den Rückgabewert und den Bestand, nie die
  entstandenen Zeilen). Hier: Check abschließen, danach das Journal öffnen und die Zeilen mit
  `referenz = check:<id>` zählen.
- **Der Verfall-Schritt existiert und schreibt.** Der Zusammenhang aus §5.3.3 ist die Begründung; ein
  DOM-Test kann ihn nicht halten, weil das Feld optional ist und ein fehlendes Feld grün aussieht.
- **Das Zustands-Literal überlebt den antd-Umbau.** `e2e/geraete.spec.ts:66` wählt heute über
  `getByRole("button", { name: "Defekt" })` und überlebt den Umbau auf `Radio.Group`/`Select`
  **nicht** — der Eingabeteil wird angepasst. Die **abschließende** Behauptung `:80`
  (`expect(page.getByText("Defekt")).toBeVisible()` auf der Check-Detailseite) prüft das
  **persistierte** Literal über die Serverauswertung hinweg und **bleibt wörtlich stehen**.
- **`?q=` und `?von=` funktionieren als geteilter Link.** Seite mit gesetzter Adresszeile direkt
  aufrufen, Filterfelder gefüllt, Liste gefiltert — und mit defektem `von` derselbe Aufruf mit
  sichtbarem Hinweis.
- **Die Ampel trägt Text, nicht nur Farbe** — bei 390×844 **und** 1280×720.

#### 5.19.5 Was kein Gate findet

Die vollständige Liste steht in §12.5. Für dieses Kapitel besonders:

- ein **Wert** aus einem `"use client"`-Modul in einer Server Component (HTTP 500) — Vitest sieht es
  strukturell nicht (§5.1);
- eine falsche Lagerort-Bezugsgröße aus der Tabelle in §5.2.1 — in einer frisch migrierten Test-DB
  sind Handlager- und Fahrzeugbestand identisch;
- der fehlende Append-only-Trigger — TypeScript sieht `.sql` nie, `build` fasst Migrationen nicht an;
- die Sekunden-Granularität der Zeitstempel — ein Test mit einer Buchung erzeugt nie zwei Zeilen in
  derselben Sekunde (§5.14.4).

---

### 5.20 Verworfene Alternativen

Die vollständige Liste steht in §13. Ausschließlich fachliche Verwerfungen, die dort sonst ohne
Zusammenhang stünden:

| Verworfen | Grund |
|---|---|
| **Inventur- und Check-Absendekonvention vereinheitlichen** | Sie sind aus gutem Grund gegenläufig: der Check zählt vollständig gegen ein Soll, die Inventur zählt stichprobenartig gegen einen Live-Bestand. Vereinheitlichen baut je nach Richtung einen Lost-Update-Kanal (`InventurForm.tsx:21-25`) oder einen Check, der nichts bucht |
| **Beide Suchhälften auf SQL `LIKE`** | Wäre eine **Verschlechterung**: die Artikelnamen-Suche ist heute unicode-fähig und würde auf ASCII-Faltung zurückfallen |
| **Beide Suchhälften in JS** | Bräuchte alle Kommentare im Prozess — genau der O(N_Buchungen)-Ladevorgang, den Entscheidung 7 gerade beseitigt |
| **Vier ODER-verknüpfte `LIKE`-Varianten** (Begriff, `toLowerCase`, `toUpperCase`, kapitalisiert) | Ohne Infrastruktur, aber eine Heuristik: sie deckt `PÄCKCHEN` gegen `Päckchen` ab und `PäCKCHEN` nicht. **Eine Suche, die in drei von vier Fällen faltet, ist schlimmer als eine, die nie faltet** — sie erzeugt Vertrauen, das sie nicht trägt |
| **Normalisierte Vergleichsspalte auf `buchungen`** | Backfill = `UPDATE buchungen` = Abbruch am Append-only-Trigger. Eine generierte Spalte scheidet aus, weil SQLite dort keine benutzerdefinierten Funktionen zulässt und `lower()` ebenfalls nur ASCII faltet |
| **`ß`/`ss` mitfalten** | Erzeugt Treffer, die niemand gesucht hat („Massen"/„Maßen"). Die Lücke ist in **beiden** Hälften gleich und damit nicht überraschend |
| **URL-Parameter umbenennen** (z. B. `q` → `suche`) | Kosten des Behaltens null, Kosten des Umbenennens gebrochene Lesezeichen, die niemand einsammeln kann (§5.14.1) |
| **`router.push` statt `replace` in der Filterleiste** | Zusammen mit dem 300-ms-Debounce ein Verlaufseintrag pro Tipppause |
| **Deckel anheben statt sichtbar machen** | Ein höherer Deckel verschiebt dieselbe stille Grenze nach hinten und kostet bei jedem Aufruf. Sichtbar machen löst das Problem, das der Nutzer tatsächlich hat |

---

### 5.21 Was dieses Kapitel abgibt

**1. Entscheidung 8 (Löschpfad) — die fachliche Hälfte ist hier entschieden, der Bau gehört
woanders hin.** Nachgeprüft: `pruefeArtikel` (`src/actions/loeschen.ts:54-64`) zählt `buchungen`,
`chargen` und `soll_positionen` — **nicht** `template_positionen.artikelId` (`schema.ts:38`, NOT NULL,
FK auf `artikel.id`). Ein Artikel, der nur in einer Fahrzeug-Vorlage steht, meldet
`loeschbar: true` und läuft beim Löschen in `FOREIGN KEY constraint failed`. `pruefeFahrzeug`
(`:70-77`) zählt `tokens.scopeLagerortId` — eine Spalte, die **kein Produktionspfad je schreibt** —
und lässt die lebende, polymorphe Spalte `tokens.zielId` (`schema.ts:141-142`) ungeprüft: ein
Fahrzeug ist löschbar, obwohl ein laminiertes Kärtchen darin auf seine ID zeigt.

**Fachlich entschieden (Variante a + c):** blockierende Bindungen sind `buchungen`, `chargen`,
`soll_positionen`, **`template_positionen.artikelId`** und **`tokens.zielId`**;
`tokens.scopeLagerortId` wird **nicht** gezählt. ⚠️ **Die Spalte selbst bleibt aber im Schema** —
das entscheidet §4.12, und diese Entscheidung geht vor: „kein Produktionspfad schreibt sie" ist eine
Code-Aussage, die produktive Tabelle steht nicht im Repo, und ein Import hat keinen zweiten Versuch.
Hard-Delete bleibt — **außer für `tokens`**, wo ihn Entscheidung 8-F (§8.3) ersatzlos streicht: `pruefeToken` (`:89-99`) und der Zweig `case "token"` (`:168`) entfallen, ein Zugangs-Code wird nur noch gesperrt, und die Token-Liste wächst dafür monoton. Für alle übrigen Objektarten bleibt er, aber `loescheElement` (`:161-172`) läuft ab jetzt **in einer Transaktion** —
heute klammert es seine zwei Schritte nicht, im Gegensatz zu jedem anderen mehrschrittigen
Schreibpfad (`check.ts:81`, `inventur.ts:25`, `templates.ts:50`, `:86`, `buchung.ts:24`). Die
FK-Verletzung bekommt ein Fangnetz mit der freundlichen Sperrmeldung (§11.5, Zustand 14); in
Produktion redigiert Next die Action-Fehlermeldung, der Nutzer sähe sonst eine generische Meldung.
Gegen (b) — Hard-Delete ganz streichen — spricht, dass die Verwaltung dann irrtümlich angelegte
Artikel nie mehr los wird und die Liste monoton wächst; die Fehlerklasse verschwindet mit den
korrigierten Zählern ohnehin.
**Abgegeben:** die Oberfläche des Löschdialogs (§6.4.5) und die Action selbst.

**2. Die IP-Quelle des Rate-Limits** (Betreiber-Entscheidung 6) hat in diesem Kapitel keine fachliche
Wirkung und steht vollständig in §3.5.

**3. Entscheidung 4 (Migrationsübertrag) — die Schema-Artefakte, die dieses Kapitel voraussetzt und
nicht liefert.** Sie sind in §4 abschließend geführt; hier steht nur, welche Aussage an welchem
hängt:

| Artefakt | Wo definiert | Wofür dieses Kapitel es braucht |
|---|---|---|
| **Zwei Triggerpaare** — `buchungen` und `bz_kontrollen`; **keins** auf `o2_messungen` | §4.4 | I1 (§5.2.2) und Entscheidung 5 (§5.12) |
| `idx_buchungen_ts_id` | §4.14 | deterministische Journalsortierung (§5.14.4) |
| `idx_buchungen_lagerort_artikel` | §4.14 | `bestandJeArtikel`, `restJeCharge` (§5.2.4) |
| `idx_buchungen_artikel_lagerort_charge` | §4.14 | `restJeChargeFuerArtikel` (§5.2.4) |
| `idx_checks_fahrzeug_completed` | §4.14 | `checkHistorie` |

⚠️ **Kein Unique-Index auf `chargen`** — der FEFO-Determinismus kommt aus der Sortierung (§5.3.1).

**4. Die Modul-Datenbankhilfe.** §5.13.2 legt fest, dass `lagerbuch` in `MODULE_MIGRATIONS` steht,
aber **nicht** in `seedAllModules`, und dass `_db/client.ts` der einzige Zugriffsweg ist. Das ist eine
Entscheidung dieses Kapitels (sie folgt aus der Suchheilung), aber sie wird in §2.2 **gebaut** — dort
gehören der `MODULE_MIGRATIONS`-Eintrag, die `COPY`-Zeile im `Dockerfile` und die bewusste
Auslassung im Bootstrap zusammen ins Registrierungs-Dreieck.

**5. An §6 abgegeben** — und dort eingelöst: die sechs listenspezifischen Suchfeldmengen und die
Sortiervorgaben der Artikelliste (§6.9.4), die Trefferanzeige und der Excel-Export über dieselbe
abgeleitete Liste (§6.9.5), das `filterOption` als Ersatz für `Combobox`-`keywords` (§6.4.3), der
Hinweistext für `altFormat`-Checks und der Hinweis „Verfall-Ampel gegen heute gerechnet" auf der
Check-Detailseite (§6.2.2, Zeile 9), die Monatsfelder mit `MONAT_REGEX`-Strenge (§6.11) und der
Löschdialog (§6.4.5). Gesammelt in §6.15.
---

## 6. Die Verwaltungs-Oberfläche in Ant Design

Dieses Kapitel legt die Fläche fest, an der **gepflegt** wird: die 24 Seiten unter
`verwaltung/`, ihre Navigation, ihre geteilten Bausteine, ihre Farben, ihre Schrift und das, was von
den 20,7 KB `src/app/globals.css` übrig bleibt. Es ist die Gegenseite zu §7 (dem Helfer-Weg):
dort wird mit Handschuhen am Lagerregal gebucht, hier wird mit Maus und Tastatur am Schreibtisch
gepflegt — und deshalb ist es die einzige Fläche des Moduls, die **antd trägt**.

**Wer sie sieht.** Ausschließlich, wer in `SUITE_ADMIN_GROUP_LAGERBUCH` steht. Der Suite-Admin bekommt
keine Lagerbuch-Rechte (Betreiber-Entscheidung 3, §2.5, §3.6). Für dieses Kapitel
heißt das: es gibt **eine** Sichtbarkeitsstufe, keine abgestuften Ansichten, keine „nur lesen"-Fassung
— jeder Knopf auf jeder dieser Seiten ist für dieselbe Personengruppe gebaut. Die Prüffrage
„führt kein Weg dorthin, wo die aufrufende Person nicht hindarf?" (`docs/design/README.md:236-242`)
ist damit auf dieser Fläche trivial erfüllt — **mit genau einer Ausnahme, die dieses Kapitel schließt:
der Druckansicht** (§6.1.3).

**Die Route-Gruppen heißen im Zielmodul `(arbeit)` und `(druck)`, nicht `(admin)`.** §2.9 hat das
festgelegt; `(admin)` ist der Name im **Quell**-Repo. Wer beim Bauen nach `(admin)` sucht, sucht im
falschen Baum.

---

### 6.0 Was dieses Kapitel NICHT entscheidet

Zehn Fragen, die zur Verwaltungsoberfläche gehören und **anderswo bereits entschieden sind**. Sie
stehen hier vollständig, damit dieses Kapitel sie nicht ein zweites Mal beantwortet — zwei
Entscheidungen zur selben Sache sind teurer als keine.

| Gegenstand | Entschieden in | Kurzfassung |
|---|---|---|
| Dateibaum, Ablageorte, die Regel „`_lib/` ohne `"use client"`" | §2.1 | Dieses Kapitel nennt Dateien nur im Ausschnitt; **maßgeblich ist der Baum in §2.1** |
| Shell je Bereich, Route-Gruppen `(arbeit)`/`(druck)` | §2.9 | `(arbeit)` bekommt `Shell variant="full"` + `nav` (über `_ui/VerwaltungsRahmen.tsx`); `(druck)/etiketten` bekommt **keine** Shell |
| Der Zugriffsriegel selbst — Name, Datei, Rumpf | §2.5, §3.6.1, §3.6.4 | `requireLagerbuchAdmin()` in `_lib/zugang.ts`, ohne `isModuleAdmin`/`session.user.isAdmin`. Dieses Kapitel entscheidet nur, **wer ihn wo ruft** (§6.1.3) |
| Mechanik des `nav`-Slots | §2.10 | `_lib/nav.ts` **ohne** `"use client"`, `href` in der **äußeren** Pfadform, `SuiteNavItem` hat kein `icon`-Feld. **Der Inhalt ist ausdrücklich dieses Kapitel** (§2.11) |
| URL-Parameter `q`/`typ`/`von`/`bis`/`fz`, `router.replace`, der `committedQ`-Tanz, `useUrlFilter` | §5.14.1–2 | Namen wörtlich übernommen; `zeitraumAus` prüft die Grenzen serverseitig und **zeigt jede verworfene Grenze an** |
| Die Deckel 100/50/100 und ihre Sichtbarmachung | §5.14.3 | Deckel bleiben, Abfrage holt `limit + 1`, der Beschreibungstext wird **bedingt**. Dieses Kapitel entscheidet nur die **Darstellung** (§6.9.3) |
| Ort und Namensgebung der Ampel | §5.17 | `_lib/ampel.ts` ohne `"use client"`; `ampelTon` liefert `"rot" \| "gelb" \| "ok" \| "grau"`. **Die Hexwerte sind ausdrücklich dieses Kapitel** (§6.6.2) |
| Der Stepper auf dem Helfer-Weg, Tap-Maß 56, `noText`, `draft` | §7.7.3 | Modul-eigenes Bedienelement in `helfer.module.css`, kein `InputNumber`. **Was aus den sechs Verwaltungs-Steppern wird, ist dieses Kapitel** (§6.4.6) |
| Ikonen-Bauform `_ui/ikonen.tsx` (Inline-SVG, kein `"use client"`) | §7.7.4 | Dieses Kapitel **übernimmt dieselbe Datei** für die Verwaltung, führt die vollständige Namensunion und schreibt das Mapping aus (§6.5) |
| Fehlerzustände, `error.tsx`, Rückgabewert statt Wurf | §11.2, §11.5–11.6 | Formularfehler am Feld, kein `Alert type="error"` auf einer Datenfläche |
| Selektorregel im Neubau und das Schicksal der 13 Alt-Specs | §12.3, §12.5 | Rollen und Beschriftungen statt Klassen. Dieses Kapitel liefert **die Anker je Seite** (§6.11) |
| Der Etikettenbogen: Druckgeometrie, Route-Gruppe, `(druck)/druck.css`, QR aus `core/qr` | §8.4 | Dieses Kapitel entscheidet nur, **welche Regel den Framework-Wechsel nicht überlebt** und **welches Bedienelement die Auswahl trägt** (§6.10) |

Und drei Dinge, die **niemand** entscheidet, weil sie außerhalb der Spec liegen: `TZ=Europe/Berlin`
(suiteweiter Eingriff, §1.5), die Entfernung des Suite-Admin-Kurzschlusses in
`core/groups.ts:104` (eigene Suite-Entscheidung, §1.5), und die Frage, ob die drei Google-Schriften
CD-gebunden sind (Betreiberfrage 29 — unbeantwortet; §6.7 entscheidet mit benannter Annahme).

---

### 6.1 Der Rahmen — zwei Layouts, ein Prädikat

#### 6.1.1 Was heute den Rahmen trägt

`verwaltung/(admin)/layout.tsx` ist 37 Zeilen und leistet vier Dinge auf einmal: es liest die Sitzung
(`:7`), riegelt ab (`:8` — `if (!session?.user?.isAdmin) redirect("/verwaltung/kein-zugriff")`),
rendert die Wortmarke plus die 218px-Seitenleiste mit `<SideNav/>` (`:11-18`), zeigt den angemeldeten
Namen (`:19-21`) und trägt das Abmelde-Formular (`:22-31`, `signOut({ redirectTo: "/" })`). Alle 24
Seiten hängen darunter.

Drei Eigenschaften dieser Datei sind für den Neubau bindend, und zwei davon sind Fallen:

1. **Es ist eine Server Component mit `await auth()` (`:7`).** Sie kann deshalb **nicht** durch
   `"use client"` repariert werden — genau der Reflex, den Falle 33 der Analyse als untauglich
   benennt. Ihr `LogOut`-Import aus `lucide-react` (`:3`) ist die teuerste einzelne Zeile der
   Portierung: würde sie 1:1 auf `@ant-design/icons` umgeschrieben, läge der **gesamte**
   Verwaltungsbereich bei HTTP 500 — und zwar beim Import, nicht beim Rendern
   (`core/shell/icons.ts:35-43`, gemessen). §6.5 schreibt die Regel aus, die das
   strukturell ausschließt.
2. **Der Riegel und die Navigation sitzen im selben Layout.** Das ist heute richtig und bleibt
   richtig: Oberfläche und Riegel wenden dasselbe Prädikat auf denselben Viewer an
   (`docs/design/README.md:240-242`, §3.6.3). Wer den Riegel in ein Layout und die Navigation in ein
   anderes legt, bekommt genau den Defekt, den §6.1.3 behandelt.
3. **`signOut({ redirectTo: "/" })` (`:25`) ist ein Client-Schreiber eines Pfades.** Er muss den
   **äußeren** Pfad tragen (Falle 63, §2.1 g); unter dem Host-Rewrite führt `/` an den Modulanfang. In
   der Suite übernimmt das die Kopfzeile — ein modul-eigener Abmeldeknopf entfällt ersatzlos
   (§6.4.10).

#### 6.1.2 Die zwei Layouts im Zielmodul

**Der maßgebliche Dateibaum steht in §2.1**; hier steht nur der Ausschnitt, den dieses Kapitel
anfasst — und er nennt keine Datei, die dort nicht steht:

```
src/app/m/lagerbuch/
  _lib/nav.ts                      ← KEIN "use client" (§2.10). Inhalt: §6.3
  _lib/ampel.ts                    ← KEIN "use client" (§5.17). Werte: §6.6.2
  _lib/schrift.ts                  ← KEIN "use client" (Falle 6). Rollen: §6.7.2
  _lib/zugang.ts                   ← der EINE Riegel der Verwaltung: requireLagerbuchAdmin (§2.5,
                                     §3.6.4). Die Datei führt daneben das nicht-werfende Paar
                                     viewerOderNull + istLagerbuchAdmin — das gehört aber in die
                                     Rollen-Weichen und aufs Gate, NICHT in diese Layouts (§3.2.1)
  _ui/ikonen.tsx                   ← KEIN "use client" (§7.7.4). Union und Mapping: §6.5
  _ui/Chip.tsx                     ← der Statuschip, RSC-fähig (§6.6.3)
  _ui/verwaltung.module.css        ← das gesamte Modul-CSS der Verwaltung, §6.8.4
  _ui/VerwaltungsRahmen.tsx        ← Shell variant="full" + nav — EINE Stelle, ZWEI Importeure (§2.1,
                                     §2.9): dieses Layout und die Blattseite g/[code]/page.tsx
  _ui/DruckRahmen.tsx              ← Rahmen OHNE Shell für den Etikettenbogen (§2.1, §2.9)
  verwaltung/(arbeit)/layout.tsx   ← requireLagerbuchHost + requireLagerbuchAdmin + VerwaltungsRahmen
  verwaltung/(arbeit)/…            ← 23 Arbeitsseiten
  verwaltung/(druck)/layout.tsx    ← DIESELBEN zwei Riegel, DruckRahmen, KEINE Shell
  verwaltung/(druck)/druck.css     ← @page + @media print, `lb-`-Präfix (§8.4)
  verwaltung/(druck)/etiketten/…   ← 1 Druckseite
```

`(arbeit)/layout.tsx` ist eine Server Component, ruft die zwei Riegel und rendert bei Erfolg
`<VerwaltungsRahmen nav={LAGERBUCH_NAV}>{children}</VerwaltungsRahmen>`, also
`<Shell variant="full" nav={…}>`. Sie enthält **kein** eigenes Chrome mehr: Wortmarke,
Modulwechsler, angemeldete Person und Abmelden liefert `SuiteHeader`. Von den 37 Zeilen des Bestands
bleiben rund zehn.

⚠️ **Und die eine Zeile, ohne die die halbe Farbentscheidung still ins Leere läuft:
`VerwaltungsRahmen.tsx` **und** `DruckRahmen.tsx` setzen `className={s.modul}` auf ihr äußerstes
Element** (`s` = `_ui/verwaltung.module.css`). Auf `.modul` liegen **alle** `--lb-*`- und
`--lb-ampel-*`-Variablen (§6.6.2a, §6.6.6); ohne den Träger löst jedes `var(--lb-…)` ins Leere auf —
und eine nicht auflösbare CSS-Variable fällt auf `transparent` zurück und ist **gültiges CSS**
(dieselbe Mechanik wie beim Taschenlampen-Knopf, §6.4.9). Der Chip bekäme Polster und Rundung ohne
Farbe, die KPI-Kante verschwände, die Plakette bliebe weiß — HTTP 200, kein Log, und der Scan aus
§6.6.2a Punkt 4 bliebe **grün**, weil er die Deklaration prüft und nicht ihren Träger. Beide Rahmen
brauchen ihn: `(druck)` rendert zwar keinen Chip, aber die Fokusregel und die Brotkrume aus §6.8.4
gelten unter beiden Group-Layouts. Die einzige Aussage, die das hält, ist ein echter Abruf je Modus
(§6.6.7).

⚠️ **Annahme:** die Wortmarke „LAGERBUCH" in Barlow Condensed (`layout.tsx:12-14`, `globals.css:132`)
entfällt im Verwaltungsbereich ersatzlos und wird durch den Modultitel der Suite-Kopfzeile ersetzt.
Sie überlebt dort, wo sie tatsächlich Wiedererkennung leistet — auf dem Gate und im Helfer-Rahmen,
also in der öffentlichen Ansichtsklasse (§7.1). Das ist eine sichtbare Änderung für die
Verwaltenden und wird hier benannt statt stillschweigend vollzogen: eine Admin-Ansicht **gehört
sichtbar zur Suite** (`docs/design/README.md:20-21`), und zwei Marken übereinander sind der Bruch,
den `feedback` und `files` beide vermieden haben.

#### 6.1.3 ⚠️ Der Riegel muss im Druck-Layout mitgehen — sonst wird hier ein bekannter Defekt neu gebaut

**Das ist der einzige Punkt dieses Kapitels, an dem eine Auslassung nicht kosmetisch wäre.**

§2.9 legt `(druck)/etiketten` als eigene Route-Gruppe **ohne Shell** fest, mit richtiger Begründung
(`FullShell` trägt `minHeight:100vh` und den App-Switcher ins Papier). §8.4 (8-H) und §2.1 d führen
den Riegel dafür bereits — dieses Kapitel wiederholt ihn nicht aus Ordnungsliebe, sondern weil genau
diese Lücke im Zielrepo schon einmal aufgetreten und dort ausgeschrieben ist:

> „DIE DRUCKANSICHT IST EIN `@media print`-BLOCK UND KEINE EIGENE ROUTE. Der Präzedenzfall `feedback`
> hat sie als eigene Route mit eigenem Layout — und **genau dort fiel sie aus dem Zugriffsriegel
> heraus, weil der Riegel im anderen Layout hing**."
> — `iuk-suite/src/app/m/files/_ui/zugangslinks.module.css:11-16`

Der Etikettenbogen ist nicht harmlos: er trägt die Zugangs-Codes **im Klartext** und als QR
(`src/db/etiketten.ts:19,23`; `src/db/etiketten.test.ts:8` prüft den absoluten Deep-Link). Eine
Druckseite ohne Riegel gibt gedruckte Zugangs-Codes an jeden aus, der die URL kennt.

**Verbindlich, in drei Teilen:**

1. **Ein Prädikat, zwei Aufrufer.** Beide Group-Layouts rufen `requireLagerbuchHost()` **und**
   `requireLagerbuchAdmin()` aus `_lib/zugang.ts` (§2.5, §3.6.4) — dieselbe Funktion, nicht zwei
   Abschriften, und **nie** `session.user.isAdmin` oder `isModuleAdmin` (§3.6.1). Das ist die
   Zwei-Linien-Regel aus §3.2.1, auf den Druckast angewandt. Eine eigene
   „Verwaltungszugriff"-Datei neben `_lib/zugang.ts` wäre genau die zweite Abschrift, gegen die
   dieser Punkt geschrieben ist.
2. **`(druck)/layout.tsx` ist eine Server Component ohne Shell und ohne `nav`** — sie rendert
   `_ui/DruckRahmen.tsx` um `{children}`, nachdem beide Riegel durch sind.
3. **Ein E2E belegt es.** Ein Abruf von `/verwaltung/etiketten` **ohne** Lagerbuch-Gruppe muss
   dieselbe Antwort liefern wie `/verwaltung/artikel` ohne Gruppe (§11.5, Zustand 19), also
   `notFound()` und nicht 403. Der Test gehört zu §6.10 und ist nicht optional: er ist der einzige,
   der die Kopplung zwischen zwei Layouts prüft, und ein Quelltext-Scan sieht sie nicht.

---

### 6.2 Die Seitenlandkarte

#### 6.2.1 Der Grundsatz: die Seite lädt und rechnet, die Insel bedient

**Alle 24 `page.tsx` unter `verwaltung/(admin)/` sind heute schon Server Components** (nachgezählt am
Stand `ca04eb1`: keine einzige trägt `"use client"`); die Interaktion liegt in 36 routen-lokalen
Client-Komponenten. Diese Aufteilung ist gut und wird **nicht** umgebaut — sie ist genau das Muster,
das die Suite in `m/files/(verwaltung)/zugangslinks/page.tsx:11-34` ausschreibt: „SIE LÄDT UND
RECHNET, DIE INSEL BEDIENT. … Der Client bekommt fertige Zeichenketten."

Daraus vier bindende Regeln für jede Zeile der folgenden Tabelle:

1. **Was an einer Uhr hängt, entsteht auf dem Server.** Ampelzustand, Restlaufzeit, „fällig seit",
   Verfallsformatierung. Rechnete der Browser es, entschieden Server und Client an der Tagesgrenze
   verschieden — und gegen die Zone des Endgeräts sogar systematisch. Die Insel bekommt
   `{ ampel, text }`, nie ein `Date`. Die Zonenrechnung selbst gehört `_lib/zeit.ts` (§4.5).
2. **Eine Seite darf keinen antd-Compound anfassen.** `Typography.Title`, `Form.Item`,
   `Descriptions.Item`, `List.Item`, `Card.Meta`, `Input.TextArea`, `Space.Compact`,
   `Grid.useBreakpoint` … ergeben in einer Server Component HTTP 500 (Falle 1). Sicher sind `Card`,
   `Statistic`, `Result`, `Progress`, `Table`, `Tag`. **Überschriften der Seiten sind deshalb nacktes
   `<h1>`/`<h2>` mit einer Typografie-Rolle aus `_lib/`** (§6.7), nicht `Typography.Title` — und das
   ist keine Notlösung, sondern erspart 24 Client-Grenzen für eine Zeile Text.
3. **Kein `@ant-design/icons` in irgendeiner Datei unter `m/lagerbuch/`** — auch nicht in einer
   Client-Insel (§6.5.1 begründet, warum die Regel weiter geht als die Falle).
4. **Jede `Table` setzt `pagination` ausdrücklich.** Alle zehn `Table`-Aufrufe der Suite tun das
   (neun `pagination={false}`, einer mit `pageSize`); kein Aufruf verlässt sich auf den Vorgabewert.
   Für dieses Modul ist die Vorgabe `pagination={false}` — die Begründung steht in §6.9.3 und ist
   nicht stilistisch, sondern eine Datenaussage.

#### 6.2.2 Die 24 Seiten

Lesart: **RSC** = die Seite selbst rendert alles; **RSC + Insel** = Server-Seite mit benannten
Client-Kindern. Die Zeilenzahlen sind die des Bestands und dienen der Aufwandsschätzung, nicht als
Zielgröße.

| # | Route | Was sie tut | antd-Bausteine | Form |
|---|---|---|---|---|
| 1 | `/verwaltung` | Übersicht: fünf Kennzahlen (`page.tsx:38-64`), Liste der kritischen Artikel, die letzten fünf Buchungen (`:20`, `limit: 5`) | `Row`/`Col` + `Card` je Kachel (**nicht** `Statistic`, §6.6.4) · `Table` für den Journalauszug · `Empty` | **RSC**, ohne eine einzige Insel |
| 2 | `/verwaltung/artikel` | Der Hauptarbeitsweg: Artikelstamm mit Bestand, Suche, drei Filtern, sechs Sortierungen, Excel-Export, Drawer je Artikel, Anlegen | `Table` (`ArtikelTable.tsx:200`) · `Input` (Suche) · `Checkbox`/`Checkbox.Group` (Filter, §6.4.4) · `Drawer` · `Modal` (Löschen) · `Button` · `Select showSearch` · `InputNumber` · `DatePicker picker="month"` mit `format="YYYY-MM"` (Verfallsmonat, §6.11) | **RSC + drei Inseln**: Tabelle (254 Z.), Drawer (393 Z.), Anlegen (82 Z.) |
| 3 | `/verwaltung/verfall` | Chargen nach Verfallsampel, „× aussondern" je Zeile | `Card` + eigene Zeilen · `Button danger`-Ersatz (§6.6.5) · `Popconfirm` | **RSC + Insel** (`AussondernRow`, 52 Z.); `VerfallItem` (31 Z.) bleibt RSC |
| 4 | `/verwaltung/fahrzeuge` | Flottenliste mit „unter Soll"/„läuft ab", Anlegen | `Table` · `Input` · `Checkbox` · `Button` | **RSC + zwei Inseln** |
| 5 | `/verwaltung/fahrzeuge/[id]` | Fahrzeugblatt: Soll-Positionen bearbeiten, Vorlage verknüpfen/lösen, Lagerort-Verfall pflegen (drittes Monatsfeld, `VerfallEditor.tsx:58`), aktiv schalten, löschen | `Table` (Soll) · `Select showSearch` · `InputNumber` · `DatePicker picker="month"` (Lagerort-Verfall) · `Switch` · `Popconfirm` · `Modal` | **RSC + vier Inseln** (`SollEditor` 105, `TemplateVerknuepfung` 89, `VerfallEditor` 82, `FahrzeugAktivToggle` 16) |
| 6 | `/verwaltung/vorlagen` | Vorlagenliste, neue Vorlage | `Table` · `Button` · `Modal` | **RSC + Insel** (28 Z.) |
| 7 | `/verwaltung/vorlagen/[id]` | Vorlage bearbeiten: Positionen, umbenennen, anwenden, löschen | `Table` · `Select showSearch` · `InputNumber` · `Input` · `Popconfirm` | **RSC + zwei Inseln** (`TemplateAktionen` 43, `TemplatePosEditor` 86) |
| 8 | `/verwaltung/checks` | Check-Historie, gefiltert nach Fahrzeug und Zeitraum — **URL-State** (`fz`/`von`/`bis`), Deckel 50 | `Table` · `Select showSearch` (Flotte) · `DatePicker` ×2 (§6.9.2) | **RSC + Insel** (`ChecksFilter`, 52 Z.) |
| 9 | `/verwaltung/checks/[id]` | Ein abgeschlossener Check im Detail: Abgleich, Nachfüllung, Geräte, Sauerstoff, Verfall. ⚠️ Die Seite **schreibt aus**, dass die Verfall-Ampel gegen **heute** gerechnet ist und nicht gegen den Check-Zeitpunkt (§5.6.3) | `Card` · `Table` · Chip statt `Tag` (§6.6.3) · `Alert type="warning"` für „Ergebnis unlesbar"/`altFormat` — **nie** `type="error"` (§6.6.5) | **RSC**, ohne Insel |
| 10 | `/verwaltung/bz` | BZ-Geräteliste mit Fälligkeitsampel, Anlegen, Sprung zum Scanner | `Table` · `Input` · `Checkbox` · `Button` | **RSC + zwei Inseln** |
| 11 | `/verwaltung/bz/scan` | Barcode scannen → direkt zur Kontrolle | keine antd-Bausteine außer `Button`; die Kamera ist eigenes Markup | **RSC + Kamera-Insel** (§6.4.9) |
| 12 | `/verwaltung/bz/[id]` | Geräteblatt: Kontrollhistorie, Referenzwerte, aktiv schalten, löschen. ⚠️ Das Logbuch zeigt je Zeile die Grenzen aus `ref_snapshot`, **nicht** die heutigen aus `bz_geraete` (§5.11) | `Card` · `Table` (Logbuch, Deckel 100) · `InputNumber` · `Switch` · `Modal` | **RSC + zwei Inseln** (`ReferenzEditor` 109, `GeraetAktivToggle` 16) |
| 13 | `/verwaltung/bz/[id]/kontrolle` | Eine Kontrolle erfassen: Messwerte, Sticks, Lanzetten | `Form` + `Form.Item` (**in der Insel**) · `InputNumber` · `Radio.Group` · `DatePicker picker="month"` (Kompressen-Verfall, `KontrolleForm.tsx:71`) · `Button` | **RSC + Insel** (`KontrolleForm`, 98 Z.) |
| 14 | `/verwaltung/sauerstoff` | Flaschenliste mit Füllstandsampel, Anlegen; die **Herkunft** der jüngsten Messung (Check gegen manuell) steht in der Zeile (§5.8.1) | `Table` · `Progress` (Füllstand) · `Input` · `Checkbox` | **RSC + zwei Inseln** |
| 15 | `/verwaltung/sauerstoff/[id]` | Flaschenblatt: Messungsverlauf **mit Herkunft je Zeile** (§5.8.1), neue Messung, aktiv schalten, löschen | `Card` · `Table` · `InputNumber` · `Switch` · `Modal` | **RSC + drei Inseln** (`MessungForm` 27, `FlascheAktivToggle` 16, `LoeschButton`) |
| 16 | `/verwaltung/geraete` | Geräteliste (medizin/objekt), MTK-Fälligkeit, Anlegen, Sprung zum Scanner | `Table` · `Input` · `Checkbox` (Mehrfachauswahl Klasse) · `Button` | **RSC + drei Inseln** |
| 17 | `/verwaltung/geraete/scan` | Barcode scannen → direkt zum Gerät | wie #11 | **RSC + Kamera-Insel** |
| 18 | `/verwaltung/geraete/[id]` | Geräteblatt: Stammdaten bearbeiten, aktiv schalten, löschen | `Form` + `Form.Item` (in der Insel) · `Select showSearch` · `DatePicker` · `Switch` · `Modal` | **RSC + zwei Inseln** (`GeraetForm` 150, `GeraetAktivToggle` 16) |
| 19 | `/verwaltung/bestellung` | Bestellvorschlag aus der Lückenformel, „bestellt"-Markierung mit **„bestellt seit &lt;Datum&gt;"** und dem Hinweis **„Ware offenbar eingetroffen"** (§5.5), CSV-Download, Zwischenablage | `Table` · `Checkbox` · `Button` | **RSC + Insel** (`BestellListe`, 63 Z.) |
| 20 | `/verwaltung/inventur` | Ist-Mengen erfassen und als Korrekturbuchungen schreiben | `Table` mit `InputNumber` je Zeile · `Button` · `Alert type="warning"` für den Fehlerfall | **RSC + Insel** (`InventurForm`, 69 Z.) |
| 21 | `/verwaltung/journal` | Buchungsjournal, **URL-State** (`q`/`typ`/`von`/`bis`), Deckel 100 | `Table` · `Input` (debounced) · `Select` (Typ-Weißliste) · `DatePicker` ×2 | **RSC + Insel** (`JournalFilter`, 88 Z.) |
| 22 | `/verwaltung/tokens` | Zugangs-Codes: anlegen, sperren, löschen, Ziel zuordnen | `Table` · `Select showSearch` · `Checkbox` · `Modal` · `Button` | **RSC + zwei Inseln** (`TokenTable` 94, `NeuToken` 123) |
| 23 | `/verwaltung/import` | CSV-Stammdatenimport mit Vorschau und Fehlerbericht | `Upload`/`Input type=file` · `Table` (Vorschau) · `Alert type="warning"` · `Button` | **RSC + Insel** (`ImportForm`, 97 Z.) |
| 24 | `/verwaltung/etiketten` → **`(druck)`** | Etikettenbogen 48,5 × 25,4 mm mit QR je Zugangs-Code, Auswahl, `window.print()` | **keine** — eigenes Markup, Druckregeln in `(druck)/druck.css` (§8.4, §6.10) | **RSC + Insel** (`EtikettenBogen`, 42 Z.), **ohne Shell** |

Dazu, außerhalb beider Gruppen: `verwaltung/kein-zugriff/page.tsx` (17 Z.). **Sie wandert nicht mit**
— das entscheidet §11.4 (Entscheidung 10a, Option a; §3.3), und dieses Kapitel gibt ihr folglich
weder einen Navigationseintrag noch einen Knopf. Ein sichtbarer Weg zu einer Sackgassenseite
verletzte genau die Gegenprobe aus `docs/design/README.md:237-242`; eine Seite, die es gar nicht
gibt, kann keinen tragen.

#### 6.2.3 Die vier großen Inseln — was an ihnen teuer ist

38 % der routen-lokalen Zeilen liegen in vier Dateien. Für drei davon ist dieses Kapitel zuständig
(die vierte, `CheckFlow.tsx` mit 495 Zeilen, gehört dem Helfer-Weg, §7.9):

**`ArtikelDrawer.tsx` (393 Z.) — der teuerste Umbau der Verwaltung.** Er trägt sechs Belange
gleichzeitig: Stammdaten bearbeiten (Mindestbestand, Fach, Einheit), Zugang buchen (Menge, Charge,
Verfall), Entnahme/Umlagerung mit Zielauswahl, Chargenliste, Löschdialog, und einen
Zustandsmechanismus, den man beim Portieren leicht zerstört. `:24-26` schreibt ihn aus: lokale,
sofort editierbare Spiegel der Serverfelder, „so that Stepper clicks / keystrokes never read back a
stale value while a commit is in flight". Der Mindestbestand **committet automatisch** mit 400 ms
Verzögerung (`:17` `MINDEST_DEBOUNCE_MS`). Daraus folgt §6.4.7: **dieses Feld kommt nicht in ein
`antd Form`.**

**`ArtikelTable.tsx` (254 Z.)** trägt die einzige echte `<table>` der Verwaltung neben dem Journal
(`:200`), sechs Sortierungen (`:30-36`) mit Name als Zweitkriterium (`:41`), drei Filter-Chips
(`:149-152`), eine Freitextsuche über **Name · Fach · Chargennummer der nächsten Charge**
(`:112-122`) — und den Excel-Export, der **am Filterzustand hängt** (`:133`,
`bestandExportZeilen(gefiltert)`; der Kommentar `:125-126` sagt „genau das, was gerade in der Tabelle
steht"). §6.9.5 macht daraus eine harte Auflage.

**`GeraetForm.tsx` (150 Z.)** ist das einzige echte Stammdatenformular der Verwaltung mit mehreren
Feldtypen und damit der eine Ort, an dem `antd Form` + `Form.Item` + `useActionState` wirklich passt
— **innerhalb der Insel**, nie in der Seite (Falle 1). Es ist zugleich die Stelle, an der
`geraete.spec.ts:66` (`button "Defekt"`) stirbt, sobald die Eingabe auf `Radio.Group` umgestellt wird
(§12.5 hat das benannt; §6.11 nennt den Ersatzanker).

---

### 6.3 Die Modulnavigation — Entscheidung 31, und was `aktiverEintrag` daraus macht

#### 6.3.1 Alle fünfzehn Ziele bleiben

**Entschieden: Option (a) der Analyse — `LAGERBUCH_NAV` führt alle 15 Ziele aus `SideNav.tsx:8-24`,
und `.modulnav` in `core` bekommt die Überlaufbehandlung, die ihr heute fehlt.** Damit ist die Frage
beantwortet, die §2.10 Punkt 3 offengelassen hat.

```ts
// src/app/m/lagerbuch/_lib/nav.ts — KEIN "use client" (§2.10).
import type { SuiteNavItem } from "@/core/shell/types";

export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht",  title: "Übersicht",     href: "/verwaltung" },
  { key: "artikel",     title: "Artikel",       href: "/verwaltung/artikel" },
  { key: "verfall",     title: "Verfall",       href: "/verwaltung/verfall" },
  { key: "fahrzeuge",   title: "Fahrzeuge",     href: "/verwaltung/fahrzeuge" },
  { key: "vorlagen",    title: "Vorlagen",      href: "/verwaltung/vorlagen" },
  { key: "checks",      title: "Checks",        href: "/verwaltung/checks" },
  { key: "bz",          title: "BZ-Kontrolle",  href: "/verwaltung/bz" },
  { key: "sauerstoff",  title: "Sauerstoff",    href: "/verwaltung/sauerstoff" },
  { key: "geraete",     title: "Geräte",        href: "/verwaltung/geraete" },
  { key: "bestellung",  title: "Bestellung",    href: "/verwaltung/bestellung" },
  { key: "inventur",    title: "Inventur",      href: "/verwaltung/inventur" },
  { key: "journal",     title: "Journal",       href: "/verwaltung/journal" },
  { key: "tokens",      title: "Zugangs-Codes", href: "/verwaltung/tokens" },
  { key: "etiketten",   title: "Etiketten",     href: "/verwaltung/etiketten" },
  { key: "import",      title: "Import",        href: "/verwaltung/import" },
];
```

Reihenfolge, Beschriftungen und `href` sind **wörtlich** die heutigen (`SideNav.tsx:9-23`), und die
`href` tragen die **äußere** Pfadform (§2.1 g, §2.10 Punkt 1). Kein `icon`-Feld — `SuiteNavItem` hat
keins, und zwar begründet (`core/shell/types.ts:19-20`).
**Kein `/`-Eintrag** — die Begründung steht in §6.3.3, sie ist die folgenreichste Zeile dieses
Abschnitts.

**Warum nicht weniger Einträge.** Die beiden Alternativen der Analyse kosten mehr als sie sparen:

- **(b) sechs bis acht in der Leiste, der Rest in ein Überlaufmenü.** `SuiteNavItem` kennt weder
  Gruppen noch Kinder (`types.ts:22-26`: `key`, `title`, `href` — mehr nicht). Ein Überlaufmenü ist
  damit eine **größere** `core`-Änderung als die Überlaufbehandlung: neuer Typ, neues Bedienelement,
  neue Tastaturführung, neue Aktivmarkierungs-Logik für verdeckte Einträge. Und die Aufteilung „welche
  sieben sind wichtig" ist eine fachliche Entscheidung, die niemand belegen kann — die Inventur ist
  einmal im Jahr wichtig und dann sehr.
- **(c) Gruppierung nach Fachbereich (Bestand · Fahrzeuge · Geräte · Betrieb).** Sie braucht eine
  dritte Ebene; die zweite **ist** `.modulnav`, einen dritten Streifen gibt es nicht
  (`shell.module.css:105-120` schreibt aus, warum der Knoten dort und nicht in der Kopfzeile sitzt).
  Und sie kostet auf jedem Weg einen Klick — bei einer Fläche, deren Nutzerinnen zwischen Artikel,
  Verfall und Journal hin- und herspringen, ist das der teuerste Preis der drei.
- **Ausgeschlossen bleibt** „nur Icons ab einer bestimmten Breite" (`types.ts:19-20`, §2.10 Punkt 2).

Unter 768px stellt sich die Frage ohnehin nicht: `.modulnav` steht dort auf `display: none`
(`shell.module.css:122-123`, aufgehoben erst in der `min-width: 768px`-Abfrage, `:183-196`) und die
Ziele wandern in den Drawer, wo eine senkrechte Liste mit 15 Einträgen die natürliche Form ist —
genau die Form, die die 218px-Leiste des Bestands heute hat.

#### 6.3.2 Der `core`-Eingriff — eine Reparatur, keine Hebung

`.modulnav` ist ein Flex-Container ohne `overflow-x`: die Grundregel steht auf `display: none`
(`core/shell/shell.module.css:122-129`), die waagerechte Fassung wird erst in der
`min-width: 768px`-Abfrage gesetzt (`:194-196`), dort in Vorgabestellung `nowrap`; `.navLink` trägt
`min-height: 56px` und `padding-inline: 12px` (`:161-169`). Fünfzehn Links mit den
lagerbuch-Beschriftungen (zusammen 127 Zeichen) liegen überschlägig bei 1.300–1.400px. Bei 1280px
kann kein Link unter seine `min-content`-Breite schrumpfen — also läuft die Zeile über, und
**`documentElement` scrollt waagerecht**. Das ist nicht „die Leiste sieht eng aus", das ist die ganze
Seite, die seitwärts wandert.

⚠️ **Zur `core`-Regel, damit die Begründung nicht unterschoben wird.** `docs/design/README.md:25-28`
verlangt einen zweiten, heute belegbaren Nutznießer — **diese Regel gilt für Hebungen**, also dafür,
Modulcode nach `core` zu verschieben. Hier wird nichts gehoben: `.modulnav` **liegt bereits** in
`core` und wird von jedem Modul benutzt. Was hier passiert, ist die Reparatur eines vorhandenen
`core`-Bausteins, den lagerbuch als erstes Modul über seine Belastungsgrenze fährt. Ein Modul, das
einen `core`-Defekt findet, darf ihn beheben; es muss dafür kein zweites Modul mitbringen. **Die
Alternative — die 15 Einträge im Modul zu verstecken, damit der `core`-Defekt unentdeckt bleibt — ist
die schlechtere: sie belässt die Falle für das sechste Modul.** (§2.10 Punkt 3 nennt lagerbuch einen
„zweiten Nutznießer"; das ist der Maßstab für eine Hebung und hier der falsche — maßgeblich ist
dieser Absatz.)

Die Änderung, vollständig:

```css
/* core/shell/shell.module.css, .modulnav */
.modulnav {
  /* … unverändert … */
  overflow-x: auto;
  scrollbar-width: thin;
  /* Der Unterstrich der Aktivmarkierung (`.navLink[aria-current]`, 2px) darf
     nicht unter einer Scrollleiste verschwinden — deshalb scrollt der Container,
     nicht `documentElement`, und die Links behalten ihre volle Höhe. */
}
```

Zwei Eigenschaften, die dabei **nicht** verloren gehen dürfen und je einen Satz Prüfung schulden:

1. **Tastaturbedienung.** Ein `overflow-x`-Container mit fokussierbaren Kindern scrollt beim Tabben
   von selbst zum fokussierten Link. Die Zusicherung dazu ist ein Playwright-Schritt, kein
   Quelltext-Scan.
2. **`prefers-reduced-motion`** ist unberührt — es wird nichts animiert und `scroll-behavior` bleibt
   ungesetzt.

**Wer welche Aussage besitzt** (`docs/design/README.md:199-212`): der Quelltext-Scan
`core/shell/shell-css.test.ts` besitzt „die Regel steht in `.modulnav`"; **Playwright bei 1280×720**
besitzt „`documentElement.scrollWidth === clientWidth` auf `/verwaltung/artikel` mit 15 Einträgen";
Playwright bei 390px besitzt „die Leiste ist unsichtbar und die Ziele stehen im Drawer". Der
1280er-Lauf ist hier der eigentliche Beweis — bei 390px sind die richtige und die kaputte Fassung
nicht zu unterscheiden.

⚠️ **Das ist die einzige `core`-Änderung dieses Kapitels** und sie gehört als eigener Commit in den
Bauweg (Anhang, Arbeit 4) — nicht als Nebenwirkung in einen Modul-Commit.

#### 6.3.3 `aktiverEintrag`, durchgerechnet — und die neun Seiten ohne Markierung

`aktiverEintrag` (`core/shell/SuiteNav.tsx:101-108`) arbeitet in drei Schritten: alle Nicht-Wurzel-
Einträge, die den Pfad **exakt** treffen oder auf die sein Pfad **endet**; davon der mit dem längsten
`href`; sonst der `/`-Eintrag als Rückfall; und wenn es keinen gibt, `null`.

Damit ergibt sich für `LAGERBUCH_NAV`, ausgerechnet statt behauptet:

| Aufgerufener Pfad | Treffer | `aria-current` |
|---|---|---|
| `/verwaltung` | `uebersicht` (Gleichheit) | `page` |
| `/m/lagerbuch/verwaltung` | `uebersicht` (Suffix) | `page` |
| `/verwaltung/artikel` | `artikel` | `page` |
| `/m/lagerbuch/verwaltung/journal` | `journal` (Suffix) | `page` |
| `/verwaltung/bz/17/kontrolle` | **keiner** — `…/kontrolle` endet weder auf `/verwaltung/bz` noch auf `/verwaltung` | **keins** |
| `/verwaltung/geraete/scan` | **keiner** | **keins** |

**Die Suffix-Regel trägt beide Pfadformen** — das ist ihr Zweck (`SuiteNav.tsx:70-82`) und der Grund,
warum die `href` die **äußere** Form tragen müssen (§2.10, Punkt 1). Innere `href`
(`/m/lagerbuch/verwaltung/artikel`) kehrten es um: gegen den äußeren Pfad schlüge `endsWith` fehl,
und die Markierung verschwände auf dem **Normalweg**.

**Betroffen sind neun der 24 Seiten:** `bz/[id]` · `bz/[id]/kontrolle` · `bz/scan` · `checks/[id]` ·
`fahrzeuge/[id]` · `geraete/[id]` · `geraete/scan` · `sauerstoff/[id]` · `vorlagen/[id]`. Heute
markiert `SideNav.tsx:33` sie über `pathname.startsWith(href + "/")` mit; nach dem Port tun sie es
nicht mehr.

**⚠️ Entschieden: der Verlust wird angenommen, nicht repariert — und dafür bekommt jede dieser neun
Seiten einen ausgeschriebenen Rückweg.** Drei Wege wären möglich gewesen, zwei sind schlechter:

- **Einen `/`-Eintrag deklarieren, damit der Rückfall greift.** Das ist die naheliegende und
  **falsche** Abkürzung. Der Wurzeleintrag ist der Rückfall für **jede** nicht getroffene Seite
  (`SuiteNav.tsx:107-108`) — und der äußere Modulwurzelpfad von lagerbuch ist **das Gate**, nicht die
  Verwaltung (`page.tsx`, §2.1 b). Ein Eintrag „Gate" in der Verwaltungsnavigation wäre auf
  neun Detailseiten hervorgehoben, während man auf einem Geräteblatt steht. Eine falsche Markierung
  ist schlechter als keine: keine sieht unaufmerksam aus, eine falsche lügt.
- **`aktiverEintrag` in `core` um einen Abschnittstreffer erweitern.** Machbar wäre
  `pfad.includes(e.href + "/")` — das trägt beide Pfadformen und markierte alle neun. Preis: eine
  Enthaltensein-Prüfung hat stille Falschtreffer (ein Pfadsegment, das den `href` als Teilkette
  enthält), und die Funktion trüge dann drei Regeln statt zwei. **Sie ist bewusst schmal gehalten**
  (`SuiteNav.tsx:97-99`: „diese Funktion soll die Rewrite-Konvention gerade nicht kennen"). Das ist
  eine `core`-Änderung mit Wirkung auf vier laufende Module für einen Kosmetikgewinn in einem — und
  damit nicht dieselbe Klasse wie die Überlaufreparatur aus §6.3.2, die einen echten Ausfall behebt.
  Wenn sie kommt, dann als eigene Suite-Entscheidung mit eigenem Test, nicht als Nebenwirkung dieser
  Spec.
- **Der gewählte Weg:** jede der neun Seiten trägt oben eine **Brotkrume** zu ihrem Abschnitt. Das
  ist ohnehin Pflicht (`docs/design/README.md:244`: „Führt jede Seite zurück … oder ist sie eine
  Sackgasse?"), und der Bestand hat sie schon — `.backlink` mit `ArrowLeft`
  (`geraete/[id]/page.tsx:3`, `bz/[id]/page.tsx:3`, `fahrzeuge/[id]/page.tsx:3`,
  `sauerstoff/[id]/page.tsx:3`, `vorlagen/[id]/page.tsx:3`, `checks/[id]/page.tsx:3`,
  `bz/scan/page.tsx:2`, `geraete/scan/page.tsx:2`, `bz/[id]/kontrolle/page.tsx:3`). Sie wandert
  eins zu eins mit und wird zur benannten Zusicherung statt zur Zierde.

⚠️ **Die Brotkrume ist eigenes Markup, kein antd-`Breadcrumb`.** Die Liste der in Server Components
sicheren antd-Komponenten ist kurz und abgeschlossen (`Card`, `Statistic`, `Result`, `Progress`,
`Table`, `Tag` — `docs/design/README.md:43`); `Breadcrumb` steht nicht darauf, und `Breadcrumb.Item`
steht ausdrücklich auf der Verbotsliste (`:42`). Die `items`-Schreibweise umgeht zwar den
Compound-Zugriff, aber ob die Komponente selbst in der RSC-Ebene lädt, ist **nicht gemessen** — und
eine ungemessene Annahme kostet hier HTTP 500 auf neun Seiten. Ein `<nav aria-label="Brotkrume">` mit
`next/link` und dem Pfeil aus `_ui/ikonen.tsx` kostet vier Zeilen und keine Messung.

#### 6.3.4 Die Auflage aus Falle 63 — `usePathname` kommt hier nicht vor

§7.8.2 hat den Riegel für den Helfer-Ast gesetzt: **`usePathname` kommt unter
`src/app/m/lagerbuch/` nicht vor**, mit Testriegel (§3.8.2). Für die Verwaltung gilt dasselbe, und sie
braucht es auch nicht:

| Heutiger Konsument | Was daraus wird |
|---|---|
| `SideNav.tsx:27,33` (Aktivmarkierung über 15 Ziele) | entfällt vollständig — `SuiteNav` in `core` macht es, mit `aktiverEintrag` statt `startsWith` |
| `Filterleiste.tsx:29,34` (`useUrlFilter` schreibt `${pathname}?${qs}`) | ⚠️ **Ausnahme, und die einzige.** `useUrlFilter` liegt in `_ui/` (§2.1) und braucht `usePathname`, weil es ein **relatives** Ziel schreibt — genau das Muster, das die Suite selbst fährt (`m/feedback/_ui/Segment.tsx:29,34`). Der Riegel aus §7.8.2 nennt diese eine Datei namentlich als Ausnahme; jede weitere Fundstelle ist ein Fehler |

**Der E2E auf `aria-current` ist Pflicht, nicht Zierrat.** Vitest ist hier strukturell blind:
`SuiteNav.test.tsx:48` mockt `next/navigation`, und der Test sagt es über sich selbst (`:263-266`:
„Der DOM-Test oben mockt `usePathname` und kann daher NICHT beweisen, dass die Auflösung unter dem
Proxy-Rewrite stimmt — das gehört dem E2E"). Dazu kommt: die vorhandene Messung steht gegen Next
**16.2.6** (`SuiteNav.tsx:92`), die Suite fährt **16.2.11** (`iuk-suite/package.json:28`), und sie
entstand per `curl` gegen einen Dev-Server ohne Reverse-Proxy (§15.2, Nr. 12).

Vorbild ist `e2e/shell-mobil.spec.ts:288-324`. Für lagerbuch mindestens **vier** Fälle, und der
letzte ist der, der sonst vergessen wird:

1. `/verwaltung/artikel` → im `[data-testid="modulnav"]` steht genau ein `a[aria-current="page"]`,
   und es ist „Artikel".
2. `/verwaltung` → genau ein `a[aria-current="page"]`, und es ist „Übersicht". ⚠️ **Diese Zusicherung
   ist gegen die Pfadform unempfindlich** — weil der `href` `/verwaltung` und nicht `/` lautet, ist
   `"/m/lagerbuch/verwaltung".endsWith("/verwaltung")` ebenfalls wahr. Das ist ein Gewinn an
   Robustheit, aber sie taugt deshalb **nicht** als Frühwarnung für eine künftige Next-Version, die
   den inneren Pfad liefert. Der `page`→`true`-Rückfall, den `SuiteNav.tsx:88-97` beschreibt, gilt
   nur für einen `/`-Wurzeleintrag — und den deklariert dieses Modul bewusst nicht.
3. `/verwaltung/geraete/17` → **`aria-current` kommt null-mal vor**, weder `="page"` noch `="true"`.
   Das ist die Zusicherung, die den angenommenen Verlust aus §6.3.3 festhält: fällt sie eines Tages
   rot, hat jemand einen `/`-Eintrag deklariert oder `aktiverEintrag` geändert — beides soll
   auffallen.
4. `/verwaltung/artikel` bei 1280×720 → `documentElement.scrollWidth === documentElement.clientWidth`
   (§6.3.2).

---

### 6.4 Die geteilten Bausteine — und für jeden: `core` oder Modul

**Die Regel, an der jede Zeile dieser Tabelle gemessen wird**, steht in
`docs/design/README.md:25-28`: „ein zweiter, heute belegbarer Nutznießer. Nicht ‚könnte man teilen',
sondern ‚ein zweites Modul braucht es jetzt'." Und der Satz danach ist der, der die Versuchung
abräumt: „Ein Muster mit einem Anwender ist eine Konvention, keine Komponente — und ein Framework für
einen Nutzer ist teurer als die Verdopplung, die es verhindern soll."

**Ergebnis vorweg: kein einziger Baustein dieses Kapitels geht nach `core`.** Die einzige
`core`-Änderung der Verwaltungsoberfläche ist die Überlaufreparatur aus §6.3.2 — und die ist eine
Reparatur an vorhandenem `core`-Code, keine Hebung. Das ist kein Zufall: was zwei Module brauchen,
liegt bereits dort (Shell, Kopfzeile, Theme, `SuiteNav`, `core/qr`); was hier entsteht, ist
lagerbuch-Fachlichkeit in antd-Kleidung.

| Baustein | Heute | Im Zielmodul | Wohin |
|---|---|---|---|
| Tabelle | `.tbl` + `<table>` (2 Vorkommen: `journal/page.tsx:39`, `ArtikelTable.tsx:200`) und **elf Karten-Listen**, die wie Tabellen gelesen werden | antd `Table` mit ausdrücklichem `pagination={false}` und `scroll={{ x: "max-content" }}` | **Modul** — antd liefert den Baustein, das Modul liefert die Spalten |
| Formular | 4 `<form>`-Elemente im ganzen Repo, kein `<select>`, 35 direkte Action-Importe, 50 `useTransition` | `antd Form` + `Form.Item` **nur in Client-Inseln**, `useActionState`, Fehler am Feld | **Modul** (§6.4.7) |
| Bestätigungsdialog | `LoeschDialog.tsx` (155 Z.), `.modaldim`/`.modalbox` (`globals.css:233-234`) | `Modal` — aber **nicht** ersatzlos, §6.4.5 | **Modul** |
| Seitliches Blatt | `.drawerdim`/`.drawer` (`globals.css:214-215`), ein Verwender (`ArtikelDrawer`) | `Drawer` | **Modul** |
| Filterleiste | `Filterleiste.tsx` (138 Z., vier Wert-Exporte) | zerlegt: Hülle → antd, `useUrlFilter` → `_ui/` (§2.1), `toggleInSet` → `_lib/`, `ZeitraumFelder` → `DatePicker` | **Modul** (§6.9) |
| Suchbares Auswahlfeld | `Combobox.tsx` (242 Z.), 16 Verwendungen, 12 Dateien | `Select showSearch` mit **ausdrücklichem** `filterOption` | **Modul** (§6.4.3) |
| Mengenfeld | `Stepper.tsx` (70 Z.), 6 Verwendungen in der Verwaltung | `InputNumber` in der Verwaltung, Modul-Stepper nur noch im Helfer-Weg | **Modul** (§6.4.6) |
| Löschknopf | `LoeschButton.tsx` (73 Z.), 4 Verwendungen | `Button` + `Modal`, §6.4.5 | **Modul** |
| Statuschip | `.chip` + vier Tonwerte (`globals.css:59-63`), 80 Verwendungen | eigenes Markup mit der Modul-Ampel — **kein** `Tag color="error"` | **Modul** (§6.6.3) |
| Kennzahlkachel | `.kpi` (`globals.css:202-205`), 39 Verwendungen, davon 21 farbig | `Card` + eigene Auszeichnung — **kein** `Statistic` mit Farbe | **Modul** (§6.6.4) |
| Verfalls-Plakette | `Plakette.tsx` (39 Z., SVG-Zifferblatt), 4 Verwendungen, davon 3 in der Verwaltung | bleibt eigenes SVG, mit drei Korrekturen | **Modul** (§6.4.8) |
| Barcode-Scanner | `BarcodeScanner.tsx` (166 Z.), 2 Verwendungen in der Verwaltung | bleibt Client-Insel, unverändert in der Bauform | **Modul** (§6.4.9, §7.6) |
| Ikonen | 54 `lucide-react`-Importzeilen, 46 Icons | `_ui/ikonen.tsx`, Inline-SVG | **Modul** (§6.5) |
| Wortmarke, Abmelden, Modulwechsler | `layout.tsx:11-31` | **entfällt** — `SuiteHeader` bringt alles mit | **`core`, vorhanden** |
| Seitenleiste/Navigation | `SideNav.tsx` (43 Z.) | **entfällt** — `Shell nav={LAGERBUCH_NAV}` | **`core`, vorhanden** |

#### 6.4.1 Die Tabelle — elf Karten-Listen werden echte `Table`

Der Bestand hat genau **zwei** `<table>` (`journal/page.tsx:39`, `ArtikelTable.tsx:200`); die übrigen
Listen sind gestapelte `.card`/`.row`-Zeilen (`globals.css:46`, `:50`). Das ist eine
Mockup-Erblast, keine Entscheidung: `.row` ist die häufigste Layoutklasse des Moduls, und sie trägt
Zeilen, die Spalten haben wollen (Name · Menge · Status · Datum). **Verbindlich: jede Liste, deren
Zeilen dieselben Felder in derselben Reihenfolge tragen, wird eine `Table`.** Das sind die Listen der
Seiten 2, 4, 5, 6, 7, 8, 10, 12, 14, 15, 16, 19, 20, 21, 22 aus §6.2.2.

Vier Eigenschaften sind an jeder von ihnen verbindlich:

1. **`pagination={false}`, ausdrücklich.** Neun der zehn `Table`-Aufrufe der Suite setzen genau das
   (`m/portal/admin/service-table.tsx:28`, `m/feedback/_ui/Zuordnung.tsx:176`,
   `m/feedback/_ui/VergleichTabelle.tsx:51`, `m/files/(verwaltung)/shares/[id]/page.tsx:478`,
   `m/files/_ui/ZugangslinksListe.tsx:206`, `…/PosteingangTabelle.tsx:403`, `…/SharesTabelle.tsx:212`,
   `…/AuditLog.tsx:142`), einer setzt `pageSize`. Kein Aufruf verlässt sich auf den Vorgabewert —
   und für die zwei gedeckelten Listen ist das keine Stilfrage, sondern eine Datenaussage (§6.9.3).
2. **`scroll={{ x: "max-content" }}`**, sofern die Spalten keine `width` tragen. Tragen sie welche,
   ist die Summe die Zahl; jede andere Pixelangabe wäre erfunden
   (`docs/design/README.md:176-178`). ⚠️ **Und die Bedingung dazu**: rc-table schaltet auf
   `table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` trägt oder `scroll.y` gesetzt
   ist — dann ändert sich **das Desktop-Bild**, ohne dass irgendwo etwas überläuft. Wer `scroll`
   ergänzt, misst die Spaltenbreiten bei 1280px vorher und nachher.
3. **`rowKey` ist die fachliche Kennung**, nie der Index. Das Journal ist append-only und wird
   umsortiert (§5.14.4); ein Index-Key vertauscht dort Zeilen bei jeder Filteränderung.
4. **Zeilenaktionen tragen `size="small"`** — die einzige von der Suite erlaubte Ausnahme von
   `controlHeight: 56` und ausdrücklich nur **innerhalb von Tabellenzeilen**
   (`docs/design/README.md:61-62`). Überall sonst wird `size` **gar nicht** gesetzt: `size="large"`
   wäre 72px, und 56 ist bereits das richtige Maß (Falle 4). Das ist die benannte Ausnahme zu §11.6
   und zu §6.15, Auflage 19.

**Die anklickbare Zeile bleibt.** `.tbl tr.click` (`globals.css:211`) macht heute ganze Zeilen zum
Ziel (Sprung ins Geräteblatt, Öffnen des Artikel-Drawers). In antd ist das `onRow={() => ({ onClick })}`.
⚠️ **Was dabei nicht verloren gehen darf**, ist die Tastaturbedienbarkeit: eine `onClick`-Zeile ohne
Rolle und ohne Tabstop ist mit der Maus bedienbar und sonst nicht. Verbindlich: **die erste Spalte
trägt zusätzlich einen echten Link bzw. Knopf** mit dem Namen als Beschriftung; die Zeilen-`onClick`
ist die bequeme Zugabe, nicht der einzige Weg. Das ist zugleich der Ersatzanker für die fünf
`tr.click`-Selektoren der Alt-Specs (§6.11).

#### 6.4.2 Die Karten-Liste, die keine Tabelle wird

Drei Listen bleiben Karten, weil ihre Zeilen **verschieden** gebaut sind und eine Tabelle sie
verstümmelte: die Verfallsliste (`verfall/page.tsx`, jede Zeile trägt Plakette + Chargentext +
Aktion), der Check-Detailbericht (`checks/[id]/page.tsx`, fünf Abschnitte mit je eigener Zeilenform)
und die Übersicht (`page.tsx`). Sie werden `Card` + eigenes Zeilenmarkup — **`List.Item` ist
verboten** (Falle 1), und `List` mit `renderItem` in einer Server Component ist ungemessen; das
eigene `<ul>/<li>` kostet nichts und ist sicher.

#### 6.4.3 Die Combobox — der billigste Gewinn, mit zwei Bedingungen

242 Zeilen Portal-, Positionierungs- und Tastaturlogik entfallen ersatzlos; `Select showSearch` kann
alles davon. **Zwei Bedingungen, ohne die der Tausch still Funktion verliert:**

1. **`filterOption` muss ausgeschrieben werden.** `Combobox.tsx:71-74` sucht über
   `` `${o.label} ${o.keywords ?? ""}` `` — also über ein Feld, das **nicht im Beschriftungstext
   steht**. Fünf Aufrufstellen leben davon: das Kennzeichen eines Fahrzeugs (`ChecksFilter.tsx:27`),
   das Fach eines Artikels (`SollEditor.tsx:93`, `TemplatePosEditor.tsx:74`), Fahrzeugname und
   Chargennummer (`ArtikelDrawer.tsx:261`, `:285`). `Select showSearch` filtert ohne weitere Angabe
   über `label`; das `keywords`-Feld kennt es nicht. **Verbindlich:** jede dieser fünf Stellen setzt
   `filterOption={(eingabe, option) => …}` gegen `label + keywords`, und die Option trägt das Feld
   ausdrücklich mit. Ohne das tippt jemand ein Kennzeichen und findet nichts — kein Fehler, keine
   Meldung, nur ein leeres Auswahlfeld.
2. **`.card { overflow: hidden }` verschwindet mit — und damit der Grund für die heutige Bauform.**
   `Combobox.tsx:37-40` begründet Portal und `position: fixed` wörtlich damit, „dass es nicht an
   `overflow: hidden`-Karten oder scrollenden Drawern abgeschnitten wird"; die Ursache ist
   `globals.css:46`. antds `Select` rendert sein Panel ebenfalls in ein Portal, das Problem ist also
   gelöst — **aber der Zusammenhang gehört in einen Kommentar am Modul-CSS**, sonst sucht die nächste
   Person ein wiederkehrendes Abschneide-Problem an der falschen Stelle.

⚠️ **Die Höhe ändert sich, und an zwei Stellen sichtbar.** Die Combobox ist heute ~43px
(`globals.css:83`: 10+10px Polster, 14px Schrift, 2×1,5px Rahmen), antds `controlHeight` ist 56 —
plus 30 %. Betroffen sind **zwei** Stellen, nicht sechzehn: `.addrow` (`globals.css:221`) kommt
dreimal vor, und nur `SollEditor.tsx:74` und `TemplatePosEditor.tsx:55` enthalten eine Combobox. Die
übrigen 14 stehen in gestapelten Formularfeldern, wo mehr Höhe senkrechten Platz kostet, aber keine
Zeile umbricht. `.addrow` trägt bereits `flex-wrap: wrap` (`:221`) — es läuft also nichts über, die
Zeile bricht nur eher um. **Das wird angenommen**; die Alternative wäre `size="small"` außerhalb einer
Tabellenzeile, und das verletzt Falle 4.

⚠️ **`geraete.spec.ts:23-24` greift `combobox "Standort"`.** Die Rolle entsteht heute, weil
`Combobox.tsx:181` `role="combobox"` und `:218` `role="option"` **von Hand** setzt. antds `Select`
setzt `role="combobox"` ebenfalls — aber die Zusicherung wird trotzdem **einmal gegen das gerenderte
Bauteil geprüft**, nicht gegen die Absicht (§12.3, Regel 2). Dasselbe gilt für das `searchbox` der
Filterleiste (§6.9.2).

#### 6.4.4 Filter-Chips — `Checkbox` statt Knopfreihe

`Filterleiste.tsx:112-121` rendert Filter als `<button aria-pressed>` in einer
`role="group"`-Umgebung. Sechs Listen benutzen das (§6.9.4). In antd wären drei Formen möglich;
verbindlich ist eine:

- **Mehrfachauswahl** (Geräteklasse medizin/objekt, Token-Ziele) → `Checkbox.Group`. Sie ist
  semantisch genau das, was `toggleInSet` (`Filterleiste.tsx:15-20`) modelliert, und trägt die
  Bedeutung ohne `aria-pressed`-Handarbeit.
- **Einzelne unabhängige Schalter** („inaktive ausblenden", „nur fällige", „unter Mindestbestand")
  → einzelne `Checkbox`. Sie sind **nicht** gegenseitig ausschließend; ein `Segmented` oder eine
  `Radio.Group` behauptete das Gegenteil.
- **`Segmented` und `Tag.CheckableTag` sind ausgeschlossen.** `Tag.CheckableTag` ist ein
  Compound-Zugriff (Falle 1) und dürfte nie in einer Seite stehen; `Segmented` modelliert eine
  Auswahl aus sich ausschließenden Werten, die es hier nirgends gibt.

⚠️ `docs/design/README.md:144` verlangt „echte Radiogruppen statt Knopfreihen (ein Tabstop pro Gruppe,
Pfeiltasten wählen nativ)". Die heutige Knopfreihe ist genau die dort gemeinte Form; der Wechsel auf
`Checkbox.Group` ist damit nicht nur ein Tausch, sondern die Erfüllung einer offenen Auflage.

#### 6.4.5 Löschen — der Dialog ist **nicht** netto null

Die Analyse führt `LoeschDialog.tsx` (155 Z.) und `LoeschButton.tsx` (73 Z.) unter „direktes
antd-Gegenstück = netto Löschung". **Das gilt für die Hülle, nicht für die Zusagen.** Was `Modal`
nicht mitbringt und deshalb wandern muss:

1. **Die Vorprüfung.** `LoeschDialog.tsx:29-31` ruft beim Öffnen `pruefeLoeschbar(art, id)` und
   zeigt das Ergebnis, bevor irgendetwas passiert. Das ist der Grund, warum der Dialog überhaupt
   existiert: ob ein Artikel löschbar oder nur deaktivierbar ist, weiß nur der Server — und §5.21
   hat die Zählerliste dafür korrigiert.
2. **Die Namenseingabe.** `:12` — „Exakter Name — muss zur Bestätigung abgetippt werden." Ein
   `Popconfirm` mit „Wirklich löschen?" ist **kein** Ersatz; es ist eine schwächere Zusage für
   dieselbe Handlung.
3. **Der zweite Ausgang.** Der Dialog bietet neben „Löschen" ein „Deaktivieren" mit
   konfigurierbarer Beschriftung (`:15`, für Zugangs-Codes heißt es „Sperren"). Ein `Popconfirm` hat
   genau einen Bestätigungsknopf.
4. **Escape schließt, ohne zu löschen** (`:40-44`) — das kann `Modal` von selbst und muss nur nicht
   verlorengehen.

**Verbindlich:** `Modal` (Hülle, Fokusfalle, Escape, Hintergrund) + eigenes Innenleben mit
Vorprüfung, Namenseingabe und zwei Ausgängen. Die Ersparnis ist real, aber sie liegt bei etwa der
Hälfte der 228 Zeilen, nicht bei allen.

**Wann `Popconfirm` genügt — und warum das Kriterium nicht „folgenlos" heißt.** Naheliegend wäre die
Grenze „rücknehmbar ja/nein". Sie trägt hier nicht: **`× aussondern` (§6.2.2 Zeile 3) ist nach §4.4
nicht rücknehmbar** und bekommt trotzdem ein `Popconfirm`. Der Grund ist, dass Aussondern **nichts
verliert** — es schreibt eine Zeile in ein append-only Journal, der Vorgang bleibt vollständig
nachlesbar, und das Rückgängigmachen ist eine Gegenbuchung, kein Wiederherstellen. Dazu kommt der
Arbeitsablauf: am Verfallsregal werden mehrere Chargen nacheinander ausgesondert; ein modaler Dialog
mit Namenseingabe je Charge macht aus einem Durchgang eine Prozedur.

**Verbindliches Kriterium ist deshalb der Datenverlust, nicht die Rücknehmbarkeit** — in drei Fällen,
und der dritte ist der, den man beim Formulieren übersieht:

1. **`Popconfirm` — die Aktion schreibt** (Aussondern als Journalzeile). Nichts wird unlesbar, der
   Vorgang steht danach in der Historie.
2. **`Popconfirm` — die Aktion löscht eine Zuordnung, die kein Journal führt, aber ohne Verlust neu
   gesetzt werden kann**: „Position aus der Vorlage entfernen" (`templates.ts:97` löscht die Zeile
   hart), „Verknüpfung lösen". ⚠️ **Nur `buchungen` ist append-only** (§4.4) — eine
   `template_positionen`-Zeile ist nach dem Löschen tatsächlich weg und steht in keiner Historie.
   Sie trägt aber nichts als ihre eigene Sollzahl: wer sie versehentlich entfernt, tippt sie in
   zehn Sekunden neu. **Kein Bestand hängt daran, keine Buchung verweist darauf.** Genau diese
   Prüfung — *was hängt an der Zeile?* — entscheidet den Fall, nicht die Frage, ob gelöscht wird.
3. **`Modal` mit Vorprüfung, Namenseingabe und zweitem Ausgang — die Aktion löscht einen
   Stammdatensatz** (Artikel, Fahrzeug, Vorlage als Ganzes). Danach ist etwas weg, an dem Buchungen,
   Chargen oder Etiketten hängen, und keine Historie holt es zurück.

Wer eine neue Aktion einordnet, geht die drei in dieser Reihenfolge durch. Der Kurzschluss
„löscht → `Modal`" ist falsch (Fall 2), der Kurzschluss „nicht rücknehmbar → `Modal`" ebenfalls
(Fall 1).

⚠️ **Rot am Löschknopf.** `.btn-ghost-rot` (`globals.css:246`) und der `.gefahr`-Kasten (`:243-245`)
sind heute rot umrandet. In der Suite ist Rot Marke **und** Primäraktion (Falle 3) — ein
`Button danger` ist deshalb erlaubt und richtig, **weil er eine Handlung ist, keine Datenfläche**.
Die Regel „kein Rot auf einer Datenfläche" trifft ihn nicht. Was sie trifft, ist der Warnkasten
darüber (§6.6.5).

---

#### 6.4.6 Das Mengenfeld — `InputNumber` in der Verwaltung, Stepper nur noch im Helfer-Weg

§7.7.3 hat für den Helfer-Weg **Option (d)** entschieden: der Stepper bleibt ein modul-eigenes
Bedienelement mit 56px-Tastflächen, die `sm`-Variante entfällt dort, `noText` und der `draft`-Zustand
bleiben. Von den elf Stepper-Verwendungen liegen **sechs in der Verwaltung**:

| Stelle | Was gezählt wird | Ersatz |
|---|---|---|
| `InventurForm.tsx:55` | Ist-Menge je Artikel bei der Inventur | `InputNumber` in der Tabellenzeile, `size="small"` |
| `ArtikelDrawer.tsx:223` | Mindestbestand (auto-committend, §6.4.7) | `InputNumber`, **außerhalb** eines `Form` |
| `ArtikelDrawer.tsx:251` | Buchungsmenge Zugang/Entnahme | `InputNumber` |
| `NeuArtikel.tsx:72` | Mindestbestand beim Anlegen | `InputNumber` im `Form.Item` |
| `KontrolleForm.tsx:78`, `:82` | Teststreifen, Lanzetten | `InputNumber` im `Form.Item` |

**Entschieden: die Verwaltung bekommt `InputNumber`, den Modul-Stepper gibt es dort nicht.** Drei
Gründe, und der erste ist der tragende:

1. **Die Bedienlage ist eine andere.** Der Stepper existiert, weil man im Fahrzeug einhändig mit
   Handschuhen zählt und nicht tippen kann. Am Schreibtisch ist Tippen schneller: „37" sind zwei
   Tastenanschläge und 37 Klicks. Die `noText`-Variante — der Wert **bewusst** nicht tippbar
   (`Stepper.tsx:19-21`) — hat in der Verwaltung gar keine Verwendung: sie steht ausschließlich in
   `CheckFlow.tsx:295` und `:461`.
2. **`InputNumber` erbt `controlHeight: 56` von selbst** (`core/theme/theme.ts:30-33` setzt es bewusst
   global, „damit … die Höhe auch auf Select, DatePicker & Co." greift) und hat damit Auf-/Ab-Flächen
   im richtigen Maß, ohne dass jemand sie baut.
3. **Es hält die Zahl der Modul-Bedienelemente klein.** Ein Stepper in zwei Ausprägungen, eine für
   antd-Kontext und eine für CSS-Modul-Kontext, wäre zwei Wahrheiten über dasselbe Bedienelement.

⚠️ **Was dabei nicht verloren gehen darf:** die großzügigen Obergrenzen. `max={9999}` bei der
Inventur (`InventurForm.tsx:55`) und in der BZ-Kontrolle (`KontrolleForm.tsx:78`, `:82`) sind
begründet — echter Überbestand muss zählbar bleiben, sonst korrigiert der Abgleich real vorhandene
Teile still heraus. `min={0}` bleibt überall. Und: **`InputNumber` bekommt `font-variant-numeric:
tabular-nums`** (§6.7), sonst springt die Zahl beim Tippen.

#### 6.4.7 Formulare — wo `antd Form` hin darf und wo nicht

Der Bestand hat **genau ein** `useActionState` (`Gate.tsx:18`, also im Helfer-Zweig), vier
`<form>`-Elemente und kein einziges `<select>`; das Muster ist stattdessen 35 direkte Action-Importe
in Client-Komponenten mit `useTransition` (50 Verwendungen) und lokalem Fehler-State. Die
Suite-Prüffrage lautet: „Kommen Fehler aus Server-Actions **am Feld** an (`useActionState`), oder auf
einer technischen Fehlerseite mit Datenverlust?" (`docs/design/README.md:245`).

**Die Regel, in einem Satz: `antd Form` überall dort, wo es einen Absendeknopf gibt — und nirgends
sonst.**

- **Mit `Form`:** `GeraetForm` (#18), `KontrolleForm` (#13), `NeuArtikel`/`NeuFahrzeug`/`NeuGeraet`/
  `NeuFlasche`/`NeuToken`/`NeuTemplate` (die sechs Anlegen-Formulare), `ImportForm` (#23),
  `MessungForm` (#15). Fehler kommen über `useActionState` am Feld an; der Rückgabewert der Action
  ist `{ ok: false; feldFehler }` (§11.2 (d)), **nie** ein gefangener Wurftext — `e.message` ist in
  Produktion der englische Satz (Falle 66).
- **Ohne `Form`:** jedes Feld, das **beim Ändern** speichert. Das sind der Mindestbestand im
  `ArtikelDrawer` (400 ms Verzögerung, `:17`), das Fach (`onBlur`), die Einheit, die Soll-Mengen im
  `SollEditor`, die Positionsmengen im `TemplatePosEditor`, die Referenzwerte im `ReferenzEditor` und
  die vier `*AktivToggle`.

⚠️ **Und die Begründung dafür ist Falle 45, nicht Bequemlichkeit.** `ArtikelDrawer.tsx:24-26` hält
lokale, sofort editierbare Spiegel der Serverfelder, „so that Stepper clicks / keystrokes never read
back a stale value while a commit is in flight" — der Kommentar bei `Stepper.tsx:25-27` sagt dasselbe
aus der anderen Richtung. Wer ein auto-committendes Feld in ein `Form.Item` hängt, hat **drei**
Zustandsquellen: Serverwert, lokaler Spiegel, `Form`-Store. In einem Feld, dessen falscher Wert ein
falscher Mindestbestand und damit ein falscher Bestellvorschlag ist, ist das der teuerste Ort für
diesen Fehler. **Das gilt auch dann, wenn `Form` „eigentlich" funktionieren würde:** der Konflikt ist
gelöst, und eine gelöste Sache neu aufzumachen ist keine Modernisierung.

⚠️ **`Form.Item` und `Input.TextArea` sind Compound-Zugriffe.** Sie stehen ausschließlich in
Client-Inseln, nie in einer `page.tsx` (Falle 1). Das ist keine theoretische Sorge: alle neun
Formulare oben liegen bereits in Client-Komponenten — die Regel schützt vor der naheliegenden
„Vereinfachung", ein kleines Formular direkt in die Seite zu schreiben.

#### 6.4.8 Die Verfalls-Plakette — bleibt, mit drei Korrekturen

Die Plakette ist ein 40×40-SVG-Zifferblatt mit zwölf Monatsstrichen, bei dem der Verfallsmonat als
längerer, dickerer Strich hervortritt (`Plakette.tsx:11-32`). Ein antd-Gegenstück gibt es nicht, und
sie ist an drei ihrer vier Stellen eine Verwaltungsfläche (`VerfallItem.tsx:21`,
`ArtikelDrawer.tsx:327`, `ArtikelTable.tsx:240`; die vierte, `HelferEntnahme.tsx:65`, gehört
§7). **Sie wandert eins zu eins — mit drei Korrekturen, die alle heute schon fällig sind:**

1. **Das `aria-label` nennt den Status.** Heute lautet es `Verfall ${fmtVerfall(verfall)}` (`:31`) —
   es nennt das **Datum**, nie den Zustand; die Farbe kommt allein aus `:9`. Dass die Bildschirme die
   Regel „Bedeutung nie allein über Farbe" trotzdem erfüllen, liegt am **Umfeld**: an allen vier
   Stellen steht heute ein Textchip daneben. Der Verstoß liegt im **Zusicherungsvertrag der
   Komponente**: als `role="img"` mit unvollständigem Label ist sie alleinstehend unbrauchbar. Neu:
   `aria-label="Verfall 03/2027 — abgelaufen"`, der Status aus derselben Quelle wie die Farbe.
2. **Die drei festen Farbwerte fallen.** `fill="#fff"` (`:32`), `var(--tinte)` für die Ziffern
   (`:34`), `#C7CDD1` für die inaktiven Striche (`:24`) — im Dunkelmodus bleibt sie sonst eine weiße
   Scheibe. Sie beziehen ihre Werte künftig aus den `--lb-*`-Modulvariablen (§6.6.6), die beide Modi
   führen.
3. **Die Ampelfarben kommen aus `_lib/ampel.ts`** (§6.6.2) und sind damit luminanz-monoton. Das ist
   der Punkt, an dem Option (d) aus Entscheidung 30 — „nur die hellen Chip-Hintergründe neu ordnen,
   Textfarben lassen" — **scheitert**: die Plakette führt gar keinen Text und trägt die Bedeutung
   ausschließlich in Ring und Strich. Wer nur die Chips anfasst, lässt genau den Fall ungelöst, für
   den die Regel geschrieben wurde.

#### 6.4.9 Der Barcode-Scanner — die Bauform bleibt, zwei Nähte brechen

`BarcodeScanner.tsx` (166 Z.) ist bereits eine saubere Client-Insel mit dynamischem Doppelimport
(`:66-69`, die zxing-Bundles laden erst beim Betreten der Seite); sein `zuBarcode`-Prop ist eine
Server Action, die zwei 13-Zeilen-Hüllen hineinreichen (`geraete/scan/GeraetScanner.tsx`,
`bz/scan/GeraetScanner.tsx`). **RSC-first ändert daran nichts**, und §7.6 besitzt das Bauteil
selbst. Zwei Stellen brechen trotzdem, und beide liegen in der Verwaltung:

1. **Die beiden Elternseiten tragen je ein Icon** (`geraete/scan/page.tsx:2`, `bz/scan/page.tsx:2`)
   und fallen damit unter Falle 33. §6.5 löst das für alle 15 Stellen auf einmal.
2. ⚠️ **Der Taschenlampen-Schalter färbt sich per Inline-Style aus `var(--rot)`/`var(--tinte)`
   (`:129-130`).** Das ist eigenes Markup **außerhalb** eines antd-Komponentenbaums — also Falle 2:
   `--ant-*`-Variablen sind dort nicht sichtbar, antd deklariert sie auf seiner Scope-Klasse. Wer
   beim Portieren reflexartig `var(--ant-color-primary)` einsetzt, bekommt einen Knopf **ohne
   Hintergrundfarbe**, und zwar still — eine nicht auflösbare CSS-Variable fällt auf `transparent`
   zurück und ist gültiges CSS. Verbindlich: `var(--lb-rot)` aus den Modulvariablen (§6.6.6).
   `shell-css.test.ts:97-98` und `not-found.test.tsx:92-93` verbieten `--ant-*` in eigenem Markup
   bereits repo-weit — der Riegel greift, wenn man ihn nicht umgeht.

Und ein dritter Punkt, der kein Bruch ist, aber leicht zerstört wird: `BarcodeScanner.tsx:45`
navigiert **hart** (`window.location.assign`), und `:42-44` begründet das ausdrücklich. Das Ziel ist
ein **äußerer** Pfad und bleibt einer (Falle 63, §2.1 g) — die naheliegende Vereinheitlichung „alles
auf `/m/lagerbuch/…`" schickte den mobilen Kernpfad in einen doppelt präfixierten Pfad.

#### 6.4.10 Was ersatzlos verschwindet

| Was | Zeilen | Wodurch ersetzt |
|---|---|---|
| `SideNav.tsx` | 43 | `Shell nav={LAGERBUCH_NAV}` (§6.3) |
| Wortmarke, „Angemeldet als", Abmelde-Formular (`layout.tsx:11-31`) | ~20 | `SuiteHeader` |
| `Combobox.tsx` | 242 | `Select showSearch` (§6.4.3) |
| Portal-/Positionslogik samt `.combo-*` (`globals.css:82-93`) | 12 CSS-Zeilen | antds eigenes Portal |
| Die Hülle von `Filterleiste.tsx` (`:83-138`) | 56 | `Input` + `Checkbox.Group` (§6.9.2) |
| `.drawerdim`/`.drawer`, `.modaldim`/`.modalbox` (`globals.css:214-215`, `:233-234`) | 4 CSS-Zeilen | `Drawer`, `Modal` |
| `.btn`-Familie (`globals.css:64-71`) | 8 CSS-Zeilen | `Button` |
| `.tbl`-Familie (`globals.css:206-213`) | 8 CSS-Zeilen | `Table` |
| `.input` (`globals.css:80`) | 1 | `Input` |

Zusammen rund **380 TSX-Zeilen und 33 CSS-Zeilen**. Was **nicht** dazugehört, obwohl die Analyse es
zunächst so eingeordnet hatte: `Filterleiste.tsx` als Ganzes (nur 56 ihrer 138 Zeilen sind Hülle,
§6.9.2) und `LoeschDialog.tsx` als Ganzes (§6.4.5).

---

### 6.5 Ikonen — die Regel, die Bauform, das Mapping (Entscheidung 29 und Falle 34)

#### 6.5.1 Die Regel, in einem Satz

> **Unter `src/app/m/lagerbuch/` importiert keine einzige Datei `@ant-design/icons` — weder eine
> Server Component noch eine Client-Insel. Alle Zeichen des Moduls kommen aus `_ui/ikonen.tsx` als
> Inline-SVG.**

Die Regel geht bewusst **weiter als die Falle**. Falle 7 verbietet den Import nur in einer Server
Component; eine Client-Insel dürfte antd-Icons benutzen. Vier Gründe, es trotzdem nicht zu tun:

1. **Die Grenze zwischen Server Component und Client-Insel verschiebt sich beim Bauen.** Wer heute
   eine Insel schreibt und morgen merkt, dass sie gar nichts Interaktives tut, löscht `"use client"`
   — und hat einen Ausfall gebaut, den weder `pnpm typecheck` noch `pnpm build` noch Vitest sieht.
   Eine Regel „nie" braucht diese Fallunterscheidung nicht.
2. **Der Ausfall ist maximal laut und maximal folgenreich.** Der nackte Spezifizierer löst über
   `exports["."].node.import` auf CJS auf, das `createContext` auf **Modulebene** ruft; in der
   RSC-Ebene gibt es das nicht → `TypeError: (0, _react.createContext) is not a function`, **schon
   beim Import, nicht beim Rendern** (`core/shell/icons.ts:35-43`, gemessen am 2026-08-01 mit einer
   Wegwerf-Route unter Next 16.2.6). Die teuerste Einzelstelle wäre `(arbeit)/layout.tsx`: ein
   einziger Icon-Import legt **alle 23 Arbeitsseiten** lahm.
3. ⚠️ **Der Reflex verschlimmert es.** `"use client"` auf eine Icon-Datei zu setzen behebt den 500
   nicht, es macht ihn **still**: gemessen liefert dieselbe Route dann HTTP 200 und
   `Object.keys(ICONS).length === 0`, weil die Server Component eine **Client-Referenz statt des
   Objekts** bekommt (Falle 6, `core/shell/icons.ts:105-112`). Die Datei schreibt das über sich
   selbst aus — „DIESE MAP IST CLIENT-ONLY. EINE SERVER COMPONENT DARF SIE NICHT IMPORTIEREN"
   (`:27`) — und hält fest, dass dort bis zum 2026-08-01 das **Gegenteil** stand und das einen halben
   Tag gekostet hat (`:29-33`).
4. **Es gibt kein zweites Icon-Vokabular zu pflegen.** §7.7.4 hat für den Helfer-Weg bereits
   `_ui/ikonen.tsx` mit Inline-SVG entschieden. Die Verwaltung nimmt **dieselbe Datei**
   — damit gibt es im Modul genau eine Zeichenquelle statt zweier, und die acht Fachzeichen (§6.5.4)
   sehen auf beiden Wegen gleich aus. Für die Helferin, die dasselbe Warndreieck am Regal und die
   Verwaltende, die es am Bildschirm sieht, ist das keine Kleinigkeit.

**Was die Regel nicht betrifft:** die Suite-Kopfzeile. `SuiteHeader`/`SuiteNav` benutzen
`core/shell/icons.ts` für den Modulwechsler — das ist `core`-Code in einer Client-Komponente und
funktioniert. Ebenso die Zeichen, die antd **selbst** rendert (der Pfeil eines `Select`, das Kreuz
eines `Modal`, der Sortierpfeil einer `Table`): die kommen aus antds eigenem Bündel innerhalb seiner
Client-Komponenten und sind kein Import des Moduls.

⚠️ **Der Registry-Eintrag ist die eine Ausnahme, und er ist keine.** `ModuleDef.icon` ist ein
**Name** (eine Zeichenkette), kein Import — `core/shell/icons.ts:13-25` löst ihn auf. Für lagerbuch
gilt dabei die dort ausgeschriebene Falle: **der Name muss ein Schlüssel dieser Map sein**, nicht bloß
ein existierender antd-Icon-Name. Beim Registry-Eintrag von `files` fehlte `FolderOutlined` in der
Map, und der Eintrag trug daraufhin still das Portal-Icon — „kein Fehler, kein Log, nur ein falsches
Bild in jeder Kopfzeile" (`:20-25`). `SuiteNav.test.tsx` prüft die Map gegen die Registry; der Test
erinnert daran, wenn man ein Modul ergänzt. Die konkrete Wahl für lagerbuch gehört §2.3, die
`core`-seitige Ergänzung §2.2, Punkt 5.

#### 6.5.2 Die Bauform

Die Datei ist dieselbe, die §7.7.4 für den Helfer-Weg entschieden hat — **eine Datei, eine Union,
eine Vorgabegröße**. Wo §7.7.4 nur die achtzehn Zeichen des Helfer-Wegs nennt, führt dieser
Abschnitt die vollständige Union.

```tsx
// src/app/m/lagerbuch/_ui/ikonen.tsx — KEIN "use client".
//
// Zwei Fallen, gegenläufig, und die Datei löst beide:
//  * Falle 6 — eine Server Component, die aus einem "use client"-Modul einen WERT
//    importiert, bekommt eine Client-Referenz statt des Wertes. Diese Datei
//    exportiert neben der Komponente die Tabelle PFADE.
//  * Falle 7 — die Gegenrichtung: ein Modul, das Client sein MÜSSTE und in der
//    RSC-Ebene ausgewertet wird. Trifft hier nicht zu: die Datei ruft nichts auf
//    Modulebene auf und gibt nur JSX zurück, läuft also in beiden Ebenen.
// Damit ist sie aus Server Components UND aus Client-Inseln importierbar.

// DIESE UNION IST DIE AUTORITÄT. 36 Namen; `_ui/ikonen.test.ts` prüft gegen sie,
// nicht gegen eine Aufzählung in der Spec. Wer ein Zeichen ergänzt, ergänzt hier.
export type IkonName =
  // 28 reine UI-Zeichen
  | "pfeil-links" | "pfeil-rechts" | "chevron-rechts" | "chevron-links"
  | "plus" | "minus" | "kreuz" | "haken" | "stift" | "papierkorb" | "archiv"
  | "kopieren" | "herunterladen" | "hochladen" | "drucken" | "lupe" | "info"
  | "erneut" | "zuruecksetzen" | "verketten" | "entketten" | "tabelle" | "liste"
  | "scannen" | "qr" | "schluessel" | "taschenlampe" | "auf-ab"
  // 8 Fachzeichen — §6.5.4 (die sieben aus der Analyse plus `fahrzeug`)
  | "warnung" | "medizin" | "objekt" | "sauerstoff" | "akku" | "verfall"
  | "handlager-griff" | "fahrzeug";

export const PFADE: Record<IkonName, string> = { /* je ein `d`-Attribut */ };

export function Ikone({ name, groesse = 18 }: { name: IkonName; groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} strokeLinecap="round"
         strokeLinejoin="round" aria-hidden focusable="false">
      <path d={PFADE[name]} />
    </svg>
  );
}
```

Drei Eigenschaften sind verbindlich:

- **`aria-hidden` ist die Vorgabe.** Jedes Zeichen dieses Moduls steht neben Text
  (`docs/design/README.md:135-136` — „Bedeutung nie allein über Farbe"; für Zeichen gilt dasselbe).
  Ein Zeichen **ohne** danebenstehenden Text ist ein Bedienelement und trägt dann ein `aria-label` am
  **Knopf**, nicht am `<svg>`. Genau ein Fall in der Verwaltung: der Taschenlampen-Schalter
  (`BarcodeScanner.tsx:134`) — und dessen Zustand muss zusätzlich `aria-pressed` tragen, weil man
  „an" von „aus" sonst nur an der Farbe erkennt.
- **`stroke="currentColor"`**, nie ein fester Wert. So erbt jedes Zeichen die Farbe seines Umfelds
  und ist im Dunkelmodus ohne Zutun richtig — dieselbe Begründung, aus der `core/shell` es tut
  (`shell.module.css:155-158`: „`--ant-*`-Variablen: die sieht eigenes Markup nicht (der Fehler wäre
  still). `currentColor` erbt die Schriftfarbe … ohne eine zweite Farbquelle aufzumachen").
- **Vorgabegröße 18px**, nicht 17 wie heute (`SideNav.tsx:36`) und nicht 15 wie in der Filterleiste
  (`Filterleiste.tsx:103`). **Eine** Größe für die ganze Datei, also auch für den Helfer-Weg;
  abweichende Größen tragen sie als Prop und begründen sie an der Aufrufstelle.

#### 6.5.3 Das Mapping — 54 Importzeilen, 46 Zeichen, 36 Namen

**Der Umfang, nachgezählt am Stand `ca04eb1`:** 54 Importzeilen aus `lucide-react`, davon **42 unter
`src/app/verwaltung/`**, verteilt auf **46 verschiedene Icons**. Ziel sind die **36** Namen der Union
aus §6.5.2 — und die Rechnung geht auf: 46 − 6 ersatzlose Streichungen − 4 Zusammenlegungen = 36.
**Maßgeblich ist die Union, nicht diese Tabelle**; wo beide auseinanderlaufen, hat die Union recht
und der Riegel aus §6.5.5 meldet es.

**A — direkt übernommen, nur umbenannt (26 Zeichen).** Reine UI-Symbole; die Form bleibt, weil sie
die gewohnte ist:

| lucide | `IkonName` | Wo (Beispiele) |
|---|---|---|
| `ArrowLeft` | `pfeil-links` | alle sechs Detailseiten-Rückwege, `geraete/[id]/page.tsx:3` |
| `ArrowRight` | `pfeil-rechts` | `CheckFlow.tsx:3` (Helfer) |
| `ChevronRight` | `chevron-rechts` | 6 Listen, u. a. `GeraeteListe.tsx:5`, `checks/page.tsx:2` |
| `ChevronLeft` | `chevron-links` | `HelferEntnahme.tsx:4` |
| `Plus` | `plus` | 8 Anlegen-Knöpfe |
| `Minus` | `minus` | `Stepper.tsx:4`, `ArtikelDrawer.tsx:4` |
| `X` | `kreuz` | 7 Schließen-Stellen |
| `Check` | `haken` | 8 Bestätigungen |
| `Pencil` | `stift` | `TemplateAktionen.tsx:4` |
| `Trash2` | `papierkorb` | `LoeschButton.tsx:4`, `SollEditor.tsx:3`, `AussondernRow.tsx:3`, `TemplatePosEditor.tsx:3` |
| `Archive` | `archiv` | `LoeschDialog.tsx:4` (Deaktivieren) |
| `Copy` | `kopieren` | `BestellListe.tsx:3`, `TemplateVerknuepfung.tsx:3` |
| `Download` | `herunterladen` | `BestellListe.tsx:3` |
| `Upload` | `hochladen` | `ImportForm.tsx:5` |
| `Printer` | `drucken` | `EtikettenBogen.tsx:3` |
| `Search` | `lupe` | `Filterleiste.tsx:3`, `BarcodeScanner.tsx:3` |
| `Info` | `info` | `bz/[id]/kontrolle/page.tsx:3` |
| `RefreshCw` | `erneut` | `TemplateAktionen.tsx:4`, `TemplateVerknuepfung.tsx:3` |
| `RotateCcw` | `zuruecksetzen` | `ArtikelDrawer.tsx:4`, `SollEditor.tsx:3` |
| `Link2` | `verketten` | `TemplateVerknuepfung.tsx:3` |
| `Link2Off` | `entketten` | `TemplateVerknuepfung.tsx:3` |
| `Sheet` | `tabelle` | `ArtikelTable.tsx:4` (Excel-Export) |
| `List` | `liste` | `TokenTable.tsx:3` |
| `ScanBarcode` | `scannen` | `geraete/page.tsx:2`, `bz/page.tsx:2`, `bz/[id]/kontrolle/page.tsx:3` |
| `QrCode` | `qr` | `HelferFrame.tsx:4` |
| `Flashlight` | `taschenlampe` | `BarcodeScanner.tsx:134` |

**B — die acht Fachzeichen** stehen in §6.5.4.

**C — vier Zusammenlegungen (−4).**

| Fällt zusammen | Ziel | Warum |
|---|---|---|
| `Key` (`Gate.tsx:5`) + `KeyRound` (`SideNav.tsx:5`) | `schluessel` | dasselbe Zeichen in zwei Zeichnungen |
| `ClipboardCheck` (`SideNav.tsx:5`, Bereich „Checks") | `haken` | der Unterschied zu `ClipboardList` trug **nur** in der Navigation Bedeutung, und die hat kein Icon mehr |
| `ClipboardList` (`SideNav.tsx:5`, Bereich „Inventur") | `liste` | dito |
| `PackageCheck` (`CheckFlow.tsx:3`, Phase „geprüft") | `haken` neben dem Phasennamen | drei Paket-Varianten nebeneinander (`Package`, `PackageCheck`, `PackageSearch`) sind kein Zeichensystem, §6.5.4 |

`ChevronsUpDown` (`Combobox.tsx:5`) fällt **nicht** darunter: es verliert zwar seinen heutigen Ort
(antds `Select` zeichnet seinen Pfeil selbst), bleibt aber als `auf-ab` erhalten, weil die
Sortierumschaltung der Artikeltabelle es braucht (§6.9.4, Punkt 3).

**D — sechs Zeichen fallen ersatzlos (−6).** Fünf erscheinen **ausschließlich** in `SideNav.tsx:5`
als Bereichszeichen der Navigation: `LayoutDashboard` (Übersicht), `LayoutTemplate` (Vorlagen),
`Boxes` (Geräte), `History` (Journal), `ShoppingCart` (Bestellung). `SuiteNavItem` hat kein
`icon`-Feld (`core/shell/types.ts:19-20`), also gibt es dort nichts zu zeichnen. Das sechste ist
`LogOut` (`layout.tsx:3`) — es fällt mit dem Abmelde-Formular, das die Suite-Kopfzeile stellt.

⚠️ **Vier Navigationszeichen sehen aus wie Kandidaten für diese Liste und sind keine**, weil sie
**außerhalb** der Navigation eine zweite Verwendung haben: `Truck` (`vorlagen/page.tsx:2`,
`TokenTable.tsx:3` — „Ziel ist ein Fahrzeug") wird zum achten Fachzeichen `fahrzeug`; `Package`,
`HeartPulse` und `CalendarClock` tragen ohnehin Fachbedeutung (§6.5.4); `QrCode` (`HelferFrame.tsx:4`)
und `Upload` (`ImportForm.tsx:5`) und `Wind` (`CheckFlow.tsx:3`) ebenso. **Wer die Navigationsliste
als Streichliste liest, streicht sieben statt fünf** — und das Ergebnis wäre ein leeres Zeichen im
Vorlagen-Kopf und in der Token-Tabelle, still (§6.5.5, Punkt 3).

#### 6.5.4 Die acht Fachzeichen — und die zwei Doppeldeutigkeiten, die aufgelöst werden

§7.7.4 zählt **sieben** Fachzeichen für den Helfer-Weg; dieses Kapitel führt **acht** — `fahrzeug`
kommt dazu, weil `Truck` außerhalb der Navigation eine fachliche Verwendung hat („Ziel ist ein
Fahrzeug", `TokenTable.tsx:3`, `vorlagen/page.tsx:2`) und nach dem Wegfall der Navigationszeichen nur
noch diese. Sie behalten alle ihre heutige Form, weil die Verwaltenden und die Helfer sie kennen:

| Zeichen | `IkonName` | Bedeutung | Belege |
|---|---|---|---|
| `HeartPulse` | `medizin` | Geräteklasse „medizin" | `GeraeteListe.tsx:29`, `GeraetForm.tsx:3`, `CheckFlow.tsx:330` |
| `Package` | `objekt` | Geräteklasse „objekt" | `GeraeteListe.tsx:30`, `GeraetForm.tsx:3` |
| `Wind` | `sauerstoff` | Sauerstoff, durchgängig | `CheckFlow.tsx:3`, `checks/[id]/page.tsx:3` |
| `BatteryCharging` | `akku` | BZ-Gerätekontrolle/Akku | `bz/[id]/page.tsx:3` |
| `CalendarClock` | `verfall` | Verfall/Fälligkeit | `FahrzeugeListe.tsx:5`, `checks/[id]/page.tsx:3` |
| `AlertTriangle` | `warnung` | Auffälligkeit — **11 Vorkommen, durchweg neben rotem Statustext** | `page.tsx:2`, `ArtikelTable.tsx:4`, `LoeschDialog.tsx:4`, `sauerstoff/[id]/page.tsx:3` … |
| `PackageSearch` | `handlager-griff` | Griff ins Handlager beim Nachfüllen | `CheckFlow.tsx:3` |
| `Truck` | `fahrzeug` | „Ziel ist ein Fahrzeug" bzw. „Vorlage ist einem Fahrzeug zugeordnet" | `TokenTable.tsx:3`, `vorlagen/page.tsx:2` |

⚠️ **Zwei Doppeldeutigkeiten bestehen heute, beide erscheinen auf demselben Bildschirm — und beide
lösen sich von selbst auf.** `Package` steht in der Navigation für den Bereich „Artikel"
(`SideNav.tsx:10`) **und** in der Geräteliste für die Klasse „objekt" (`GeraeteListe.tsx:30`);
`HeartPulse` in der Navigation für „BZ-Kontrolle" (`SideNav.tsx:15`) **und** in der Geräteliste für
„medizin" (`:29`). Die Seitenleiste ist auf `/verwaltung/geraete` sichtbar, beide Paare stehen also
gleichzeitig im Bild. **Weil die Modulnavigation keine Icons mehr trägt, verschwindet jeweils die
Navigationsbedeutung — und die fachliche bleibt allein übrig.** Das ist kein Zufallsgewinn, sondern
der Grund, ihn hier aufzuschreiben: wer eine 1:1-Icon-Tabelle anlegte, verfestigte die
Doppeldeutigkeit; wer sie stillschweigend auflöste, träfe eine fachliche Entscheidung ohne Protokoll.
`PackageCheck` (Phase „geprüft" im Fahrzeug-Check) fällt in dieselbe Klasse und wird zu `haken` neben
dem Phasennamen aufgelöst — drei Paket-Varianten nebeneinander sind kein Zeichensystem.

⚠️ **`AlertTriangle` ist kein reines UI-Symbol**, obwohl es so aussieht: es steht an allen 11 Stellen
neben rotem Statustext und trägt damit dieselbe Aussage wie die Ampel. Es bezieht seine Farbe deshalb
aus `_lib/ampel.ts` (§6.6.2) und **nie** aus `colorError` — sonst steht ein Zeichen in Suite-Rot neben
einem Chip in Ampel-Rot, und die beiden Rot sind verschieden.

#### 6.5.5 Der Riegel — und warum der vorhandene nicht reicht

`core/shell/icons.test.ts:147-171` ist ein repo-weiter Quelltext-Scan über vier Importformen: er
findet jede Datei, die `@ant-design/icons` oder `core/shell/icons` **ohne** `"use client"` importiert,
und meldet sie namentlich. Beim Portieren schlägt er zu, und das ist gut.

⚠️ **Was er strukturell nicht sieht** (§12.4 hält es fest): ein **modul-eigenes Blatt, das die Icons
re-exportiert**. Eine Datei `_ui/antd-icons.ts` mit `export { CheckOutlined } from "@ant-design/icons"`
würde vom Scan gefunden — aber eine Datei, die sie über einen Alias oder einen dynamischen Import
einzieht, nicht zwangsläufig. Und der Scan sagt nichts darüber, ob die Regel aus §6.5.1 (**gar
keine** antd-Icons im Modul, auch nicht in Client-Inseln) eingehalten wird: eine Client-Insel mit
antd-Icons ist für ihn ein gültiger Zustand.

**Verbindlich kommt deshalb ein zweiter, modul-eigener Riegel dazu:**

```ts
// src/app/m/lagerbuch/_ui/ikonen.test.ts
// Quelltext-Scan über ALLE Dateien unter src/app/m/lagerbuch/:
//  1. keine importiert "@ant-design/icons" (auch nicht mit "use client"),
//  2. keine importiert "lucide-react" (die Suite führt das Paket gar nicht),
//  3. jeder in einer .tsx verwendete IkonName steht als Schlüssel in PFADE.
```

Punkt 3 ist der, der still bricht: ein Tippfehler im Namen ergibt `PFADE["warnungg"] === undefined`,
ein `<path d={undefined}>` und ein **unsichtbares** Zeichen — gültiges SVG, HTTP 200, kein Log. Das
ist dieselbe Fehlerklasse wie der falsche Registry-Icon-Name bei `files`, nur ohne Rückfall.

**Was auch dieser Riegel nicht kann**, und deshalb hier steht: er sieht nicht, ob das **richtige**
Zeichen gewählt wurde. Ein `objekt` statt `medizin` ist gültiger Code, korrektes Rendern und ein
falsches Bild. Dagegen hilft nur, dass die acht Fachzeichen namentlich in §6.5.4 stehen und der
echte Abruf aus §12.4 auf `/verwaltung/geraete` **beide** Klassen im Bild hat.

---

### 6.6 Farbe — Entscheidungen 30 und 34

#### 6.6.1 Das Problem, gemessen

Die Suite setzt `colorPrimary` **und** `colorError` auf `#c8000f` (`core/theme/theme.ts:22-23`). Ein
`Alert type="error"` sieht damit aus wie eine Primäraktion. lagerbuch trennt die beiden Rollen heute
nicht über den Farbton, sondern über die **Flächenform**: die Primäraktion ist eine vollflächige rote
Schaltfläche mit weißer Schrift (`globals.css:65` `.btn-rot`), der Fachstatus ein blasser Chip aus
`--rot-bg` `#fbe9eb` mit rotem Text (`:60` `.chip-rot`). In antd verschwindet diese Trennung:
`Tag color="error"`, `Alert type="error"` und `Button type="primary"` greifen alle auf denselben Token
zu.

**Der Umfang, nachgezählt am Stand `ca04eb1`:**

| Träger | Zahl | Beleg |
|---|---|---|
| `chip-rot` | **27** | `globals.css:60`; u. a. `ArtikelTable.tsx:76` („unter Mindestbestand"), `checks/[id]/page.tsx:99` („fehlt {a.offen}"), `:173` („niedriger Druck"), `FahrzeugeListe.tsx:63` („{n} unter Soll") |
| `chip-gelb` | **12** | `globals.css:61` |
| `chip-ok` | **15** | `globals.css:62` |
| `chip-grau` | **26** | `globals.css:63` |
| `btn-rot` | **28** | `globals.css:65` |
| KPI-Kacheln gesamt | **39** | `globals.css:202`, in zehn Dateien |
| davon mit farbiger linker Kante | **21** | `globals.css:203` (`.kpi.rot`/`.kpi.gelb`/`.kpi.ok`) |
| Journal-Delta | 2 Tonwerte | `globals.css:176` (`.jdelta.minus` rot, `.jdelta.plus` grün) |

Für Fehlbestand, Verfall, überfällige MTK, niedrigen Sauerstoffdruck und fehlende Geräte **ist** Rot
die Fachaussage — und `docs/design/README.md:126-131` lässt das nicht durch Weglassen erfüllen. Es
erzwingt eine modul-eigene Statuspalette, und `core/theme/tokens.ts:6-11` sieht diese Ausnahme
ausdrücklich vor.

⚠️ **Ein Befund, der beim Nachrechnen abfiel und heute schon gilt:** `chip-gelb` ist
`#b26a00` auf `#fbf1dc` — **Kontrast 3,78 : 1**, also **unter AA** (4,5 : 1 für normalen Text). Es
ist der einzige der vier Tonwerte, der durchfällt (`chip-rot` 5,19 · `chip-ok` 4,66 · `chip-grau`
4,91). Die Palette unten behebt das nebenbei; sie ist damit nicht nur eine Umfärbung, sondern die
Korrektur einer bestehenden Barrierefreiheits-Lücke.

#### 6.6.2 `_lib/ampel.ts` — die Werte, mit ihren Luminanzen

**Entschieden: Option (c) der Analyse — die drei Werte werden so nachjustiert, dass die relative
Luminanz über die Rangfolge gut → schlecht monoton fällt.** Damit ist Entscheidung 30 beantwortet;
§5.17 hat festgelegt, **dass** die Palette modul-eigen ist, hier stehen die **Werte**. Option (b)
(„die heutigen drei Werte unverändert übernehmen") wäre der Weg, an dessen Ende ein von der Spec
verlangter Test von Anfang an rot steht; Option (d) („nur die hellen Chip-Hintergründe neu ordnen")
lässt genau den Fall ungelöst, für den die Regel geschrieben wurde — die Plakette führt keinen Text
(§6.4.8).

Die heutigen Werte sind **nicht** monoton: ok `#1e7a3c` = **0,1452**, gelb `#b26a00` = **0,1977**,
rot `#c8000f` = **0,1231**. Über die Rangfolge gut → schlecht steigt die Luminanz und fällt dann;
Gelb ist der **hellste** der drei, Grün und Rot liegen 0,022 auseinander. In Graustufen und bei
Rot-Grün-Blindheit — dem häufigsten Fall — ist die Rangfolge damit heute nicht ablesbar
(`docs/design/README.md:138-141`).

```ts
// src/app/m/lagerbuch/_lib/ampel.ts — KEIN "use client" (§5.17).
//
// FACHSEMANTISCHE PALETTE DES MODULS, analog `m/feedback/_lib/noten.ts`.
// `core/theme/tokens.ts:6-11` sieht diese Ausnahme ausdrücklich vor.
//
// DIE LUMINANZ FÄLLT MONOTON über ok -> gelb -> rot. Die Werte sind gerechnet,
// nicht gegriffen; `ampel.test.ts` rechnet sie nach und schlägt an, sobald ein
// späterer „schönerer" Farbtausch den Kanal zerstört.
export type Ampel = "rot" | "gelb" | "gruen";
export type Ton = "rot" | "gelb" | "ok" | "grau";

export const AMPEL_HELL = {
  ok:   { text: "#1e7a3c", flaeche: "#e4f2e9" }, // L 0,1452 — Kontrast 4,66 : 1
  gelb: { text: "#8a5200", flaeche: "#fbf1dc" }, // L 0,1144 — Kontrast 5,69 : 1
  rot:  { text: "#8c0d16", flaeche: "#f6e3e0" }, // L 0,0592 — Kontrast 7,78 : 1
  grau: { text: "#5b6570", flaeche: "#e7eaec" }, // L 0,1270 — Kontrast 4,91 : 1 — KEIN Ampelwert
} as const;

export const AMPEL_DUNKEL = {
  ok:   { text: "#7ee0a0", flaeche: "#10261a" }, // L 0,6028 — Kontrast 9,94 : 1
  gelb: { text: "#d9a032", flaeche: "#2a1e05" }, // L 0,4012 — Kontrast 7,02 : 1
  rot:  { text: "#e8837c", flaeche: "#2a1113" }, // L 0,3484 — Kontrast 6,71 : 1
  grau: { text: "#9aa4ad", flaeche: "#1c2024" }, // L 0,3644 — Kontrast 6,47 : 1 — KEIN Ampelwert
} as const;
```

**Was sich ändert und was nicht, und warum in dieser Aufteilung:**

- **Grün bleibt `#1e7a3c` — unverändert.** Es ist der Wert vom Etikett und aus dem Fahrzeug, und es
  liegt bereits richtig. Wer eine gewohnte Farbe ohne Not ändert, zahlt Wiedererkennung für nichts.
- **Gelb wird dunkler: `#b26a00` → `#8a5200`.** Das ist die sichtbarste Änderung — und sie ist
  zweifach begründet: sie stellt die Monotonie her **und** sie behebt den AA-Verstoß aus §6.6.1. Ein
  Bernstein, das dunkler wirkt als heute, ist der Preis; ein Warnzustand, der heller aussieht als
  „alles in Ordnung", ist der Fehler.
- **Rot wird ein eigener Wert: `#c8000f` → `#8c0d16`.** Das ist **keine** Stilfrage, sondern die
  Umsetzung von §5.17, Punkt 2: Suite-Rot ist Marke und Primäraktion, nie Statusfarbe. Solange
  Ampel-Rot und Primär-Rot derselbe Hexwert sind, stehen auf `/verwaltung/artikel` ein
  „unter Mindestbestand"-Chip und ein „Artikel anlegen"-Knopf in exakt derselben Farbe — und die
  Person, die beides zum ersten Mal sieht, hat keinen Grund, sie für verschiedene Dinge zu halten.
- **Grau ist kein Ampelwert** und steht deshalb außerhalb der Rangfolge. Er trägt „kein Datum
  gepflegt" (`geraet.ts:35`) und „keine Messung" (`sauerstoff.ts:51`) und darf **nie** als grün
  dargestellt werden (§5.17). Dass seine Luminanz (0,1270) zwischen gelb und ok liegt, ist deshalb
  kein Verstoß — der Monotonie-Test bezieht ihn ausdrücklich nicht ein.

#### 6.6.2a ⚠️ Wie die Werte in die Oberfläche kommen — und warum das nicht nebenbei geht

Die Werte oben stehen in **TypeScript**. Der Statuschip (§6.6.3) ist ein **CSS-Modul**. Der
Moduswechsel ist **reines CSS** (`:root[data-theme="dark"]`, §6.6.6) — eine Server Component, die
einen Chip rendert, weiß gar nicht, welcher Modus gilt. **Ein CSS-Modul kann keine TS-Konstante
lesen.** Wer das nicht ausschreibt, bekommt beim Bauen eine von zwei schlechten Antworten: die
Hexwerte ein zweites Mal in `verwaltung.module.css` (zwei Quellen der Wahrheit — genau das, was
§6.6.6 verbietet), oder einen Chip, der im Dunkelmodus hell bleibt.

**Der Weg ist der aus §6.6.6, nur auch für die Ampel benutzt: CSS-Variablen auf dem
Modul-Wurzelelement.**

```css
/* _ui/verwaltung.module.css — die Ampel läuft über dieselbe Leitung wie die Neutralen. */
.modul {
  --lb-ampel-ok-text:   #1e7a3c;  --lb-ampel-ok-flaeche:   #e4f2e9;
  --lb-ampel-gelb-text: #8a5200;  --lb-ampel-gelb-flaeche: #fbf1dc;
  --lb-ampel-rot-text:  #8c0d16;  --lb-ampel-rot-flaeche:  #f6e3e0;
  --lb-ampel-grau-text: #5b6570;  --lb-ampel-grau-flaeche: #e7eaec;
}
:root[data-theme="dark"] .modul {
  --lb-ampel-ok-text:   #7ee0a0;  --lb-ampel-ok-flaeche:   #10261a;
  --lb-ampel-gelb-text: #d9a032;  --lb-ampel-gelb-flaeche: #2a1e05;
  --lb-ampel-rot-text:  #e8837c;  --lb-ampel-rot-flaeche:  #2a1113;
  --lb-ampel-grau-text: #9aa4ad;  --lb-ampel-grau-flaeche: #1c2024;
}
.chip     { display:inline-flex; align-items:center; gap:4px; border-radius:99px;
            padding:2.5px 9px; font-size:12px; font-weight:600; white-space:nowrap }
.ok       { color: var(--lb-ampel-ok-text);   background: var(--lb-ampel-ok-flaeche) }
.gelb     { color: var(--lb-ampel-gelb-text); background: var(--lb-ampel-gelb-flaeche) }
.rot      { color: var(--lb-ampel-rot-text);  background: var(--lb-ampel-rot-flaeche) }
.grau     { color: var(--lb-ampel-grau-text); background: var(--lb-ampel-grau-flaeche) }
```

**Die Rollenteilung, damit „zwei Quellen" nicht durch die Hintertür entsteht:**

- `_lib/ampel.ts` ist die Quelle für die **Zuordnung** (`ampelTon`, der Typ `Ton`) **und** für die
  Werte als Konstanten. Alles, was in TypeScript eine Farbe braucht — die Plakette (§6.4.8), die
  KPI-Kante (§6.6.4), das `warnung`-Zeichen (§6.5.4) —, liest sie von dort.
- `verwaltung.module.css` ist die Quelle für die **Darstellung** und trägt dieselben Werte als
  Variablen, weil CSS anders nicht an sie herankommt. Für den Helfer-Weg tut `helfer.module.css`
  dasselbe (§7.7.4).
- ⚠️ **Und weil sie damit an zwei Orten stehen, muss ein Test sie aneinander binden.** Ohne ihn
  driften sie still, und der Monotonie-Test bewiese etwas über eine TS-Konstante, die niemand mehr
  rendert.

**Der Test dazu** (`_lib/ampel.test.ts`) prüft deshalb **vier** Aussagen, die ersten drei in beiden
Modi:

1. `L(ok) > L(gelb) > L(rot)` — die Monotonie, gerechnet nach sRGB aus den Hexwerten.
2. Jeder Tonwert erreicht gegen seine eigene Fläche mindestens 4,5 : 1.
3. `AMPEL_HELL.rot.text !== FARBEN.rot` — Ampel-Rot ist **nicht** Suite-Rot. Das ist die Zeile, die
   anschlägt, wenn jemand später „vereinheitlicht".
4. **Quelltext-Scan über die Modul-CSS-Dateien** — `_ui/verwaltung.module.css` **und**
   `_ui/helfer.module.css`, denn beide tragen die Werte (§7.7.4); ein Scan über nur eine von beiden
   ließe die Hälfte driften: für jeden der acht Namen aus `AMPEL_HELL` und
   `AMPEL_DUNKEL` steht dort eine `--lb-ampel-*`-Deklaration mit **genau** diesem Hexwert, unter
   `.modul` bzw. `.rahmen` und unter dem jeweiligen `:root[data-theme="dark"]`-Gegenstück. Das ist dieselbe Bauform wie
   `core/theme/feldschrift.test.ts` und `core/shell/shell-css.test.ts` — ein Scan besitzt die
   Aussage „die Regel trägt den richtigen Wert"; ob sie am Bildschirm greift, besitzt der Abruf aus
   §6.6.7.

Die Suite hat einen Monotonie-Test bereits für die Schulnoten-Ampel des Moduls `feedback`; für
lagerbuch gäbe es ihn nicht automatisch, und ohne ihn ist die Monotonie eine Behauptung im Kommentar.

---

#### 6.6.3 Die 80 Statuschips

**Verbindlich: eigenes Markup, nicht `Tag`.**

```tsx
// _ui/Chip.tsx — läuft in RSC und in Client-Inseln (kein "use client", kein Modulebenen-Aufruf).
// Die Farbe kommt NICHT als Prop, sondern über die Klasse aus den CSS-Variablen (§6.6.2a) —
// nur so trägt der Chip beide Modi, ohne dass der Server den Modus kennen muss.
export function Chip({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return <span className={`${s.chip} ${s[ton]}`}>{children}</span>;
}
```

Drei Gründe gegen `Tag`:

1. **`Tag color="error"` greift auf `colorError` zu** — also auf Suite-Rot, also auf Falle 3. Es gibt
   in antd keinen Weg, `Tag` eine fachsemantische Palette unterzuschieben, außer ihm eine eigene
   Farbe als Prop zu geben — dann ist der Baustein aber nur noch eine Hülle mit Rundung.
2. **Der Fehler wäre nicht sichtbar kaputt, sondern nur falsch.** Ein `Tag color="error"` ist
   gültiges antd; im jsdom-DOM steht in beiden Fällen dieselbe Klasse, und am Bildschirm sieht es
   nicht defekt aus. Kein Gate fängt das.
3. **`Tag.CheckableTag` ist ein Compound-Zugriff** (Falle 1) — wer `Tag` als Baustein etabliert,
   macht den Griff dorthin wahrscheinlicher.

**Und die Regel, die über der Farbe steht:** jeder Chip trägt **Text**, nie nur Farbe. Das ist im
Bestand schon so — `chargeText` (`format.ts:29-34`) und `geraetFaelligChip` (`format.ts:50-65`)
liefern ihn, und sie werden mitportiert statt durch ein farbiges Zeichen ersetzt (§5.17, Punkt 3).

⚠️ **Die Namensfalle geht mit** (§5.17): `chipTone` (`format.ts:42-44`) bildet `"gruen"` auf `"ok"`
ab, weil die CSS-Klassen `chip-rot`/`chip-gelb`/`chip-ok` heißen. Ein direkt interpoliertes
`chip-${ampel}` ergäbe ein undefiniertes `chip-gruen` — mit Polster und Rundung, aber **ohne Farbe**.
Im Zielmodul heißt die Funktion `ampelTon` und liefert `"rot" | "gelb" | "ok" | "grau"`; die
CSS-Modul-Schreibweise `s[ton]` hat dieselbe Falle (`s["gruen"] === undefined` ergibt
`className="chip undefined"`), und der Riegel dagegen ist der Typ `Ton`, nicht die Wachsamkeit.

#### 6.6.4 Die 39 KPI-Kacheln — `Card`, nicht `Statistic`

Die Kachel ist heute ein Flex-Kasten mit **farbiger linker 4px-Kante** (`globals.css:202-203`);
21 der 39 tragen eine Ampelfarbe. Genau diese Form — „Text plus 3px linke Kante" — ist das, was
`docs/design/README.md:57` als Ersatz für ein rotes `Alert` **vorschlägt**. Sie bleibt also, und
zwar bewusst:

- **`Card` als Hülle** (in RSC sicher, `docs/design/README.md:43`), die Kante als Modul-CSS mit der
  Ampelfarbe aus `_lib/ampel.ts`.
- **Kein `Statistic` mit `valueStyle={{ color: … }}`.** `Statistic` ist zwar RSC-sicher, aber die
  farbige **Zahl** ist genau „Rot auf einer Datenfläche": eine rote 7 ist von einer 7 in Suite-Rot
  nicht zu unterscheiden, und ein Zahlenwert ist die Datenfläche schlechthin. Die Kante trägt die
  Farbe, die Zahl trägt Tinte.
- **Die Zahl trägt `tabular-nums`** (§6.7) — Kacheln stehen nebeneinander und werden verglichen.
- **`Row`/`Col` mit `xs`/`md` statt fester Breiten** (`docs/design/README.md:160-161`). Heute ist es
  ein `grid-template-columns: repeat(auto-fill, minmax(190px, 1fr))` (`globals.css:201`) mit einer
  zweiten Fassung bei ≤760px (`:259-261`) — der Breakpoint verschwindet mit §6.8.6.
- ⚠️ **Sechs der Kacheln sind Links** (`page.tsx:41`, `:46` — `<Link className="kpi …">`). Eine
  klickbare Kachel ohne erkennbare Klickbarkeit ist eine Sackgasse für alle, die es nicht zufällig
  ausprobieren. Verbindlich: die verlinkten Kacheln tragen ein Chevron und einen Fokusring; die
  nicht verlinkten tragen keinen Hover-Effekt.

#### 6.6.5 Die 28 roten Knöpfe und die drei roten Kästen

**Rot bleibt auf Handlungen — dort ist es richtig.** Die Regel „nie auf einer Datenfläche" trennt
Handlung von Aussage, nicht rot von nicht-rot:

| Heute | Rolle | Im Zielmodul |
|---|---|---|
| `.btn-rot` (28×) | Primäraktion („Buchen", „Abschließen", „Anlegen") | `Button type="primary"` — Suite-Rot, richtig |
| `.btn-ghost-rot` (`globals.css:246`) | destruktive Aktion | `Button danger` — Suite-Rot, richtig (§6.4.5) |
| `.gefahr` (`globals.css:243-245`) | Rahmen um die Löschzone | bleibt: 1px Rahmen in Suite-Rot um einen **Handlungsbereich**, keine Fläche mit Daten darin |
| `.warnbox` (`globals.css:239`) | Fläche `--rot-bg`, Text `--rot`, **trägt eine Fachaussage** („Charge abgelaufen", „nicht löschbar") | **Ampel-Rot**, nicht Suite-Rot — es ist eine Datenfläche |
| `.infobox` (`globals.css:240`) | Fläche `--gelb-bg`, Text `--gelb` | **Ampel-Gelb** |
| `.jdelta.minus`/`.plus` (`globals.css:176`) | Vorzeichen einer Buchung | **Ampel-Rot/-Grün**, und zusätzlich das Vorzeichen im Text (steht heute schon da, §12.2 Punkt 4) |

**Und die harte Ausschlussregel, die daraus folgt:** `Alert type="error"` erscheint in diesem Modul
**nirgends** (§11.6). Fehlermeldungen tragen `type="warning"`, oder sie sind Text mit 3px linker
Kante (`docs/design/README.md:57`). Das ist keine Vorsicht, sondern Notwendigkeit: ein
`Alert type="error"` über einer Liste mit Ampel-Chips brächte zwei verschiedene Rot auf denselben
Bildschirm, und das kräftigere gehörte der Fehlermeldung statt dem abgelaufenen Medikament.

#### 6.6.6 Die acht Neutralfarben — Entscheidung 34, Option (c) mit ausgeschriebener Grenze

Der Farbsatz ist bereits identisch: `globals.css:4-15` und `core/theme/tokens.ts:14-25` führen
dieselben zwölf Hexwerte unter denselben deutschen Namen, und `tokens.ts:3-4` nennt als Herkunft
ausdrücklich „den `@theme`-Block der abgelösten `globals.css`". **Nicht** deckungsgleich ist die
**Bindung**: `theme.ts:22-25` sind **vier Token-Zeilen, aber nur drei Werte** — `FARBEN.rot` steht
dort zweimal, für `colorPrimary` **und** `colorError` (genau die Gleichheit, die Falle 3 in
`CLAUDE.md` beschreibt). Gebunden sind damit **drei** der zwölf: `rot`, `gelb` (`colorWarning`),
`ok` (`colorSuccess`). **Ungebunden bleiben neun** — `rot-dk`, `rot-bg`, `tinte`, `stahl`, `linie`,
`papier`, `karte`, `gelb-bg`, `ok-bg` —, und sie haben antd-Entsprechungen mit **anderen** Werten.

⚠️ **Die Analyse zählt in Entscheidung 34 „acht Neutralfarben", dieser Abschnitt neun ungebundene —
beide stimmen, sie zählen verschiedene Mengen.** E34 fragt, welche der *neutralen* Werte auf
antd-Tokens umgestellt werden, und rechnet `rot-dk`/`rot-bg` zur Rot-Familie statt zu den Neutralen;
hier geht es um alle zwölf abzüglich der drei gebundenen. Wer die Zahlen nebeneinander liest, soll
nicht stutzen müssen.

⚠️ `gelb` und `ok` gehören ausdrücklich **nicht** in diese Liste: sie sind gebunden, und ihre Flächen
laufen ohnehin über `--lb-ampel-*` (§6.6.2a). Sie brauchen kein zweites `--lb-*`. Der `.modul`-Block
unten deklariert deshalb sechs Namen, nicht neun — die Differenz ist kein Versehen, sondern diese
Regel.

**Entschieden: Option (c) — gemischt, und die Grenze verläuft entlang der Frage „wer zeichnet die
Fläche?"**

| Rolle | Wer zeichnet | Wert |
|---|---|---|
| Flächen und Rahmen **innerhalb** eines antd-Baums (`Card`, `Table`, `Modal`, `Drawer`, `Input`) | antd | **antd-Token** — `colorBgContainer`, `colorBorder`, `colorBgLayout`, `colorTextSecondary`. Kein Modul-CSS dagegen |
| Flächen und Rahmen in **eigenem** Markup (Chip, KPI-Kante, Plakette, Etikettenbogen, Scanner-Knopf, Brotkrume) | das Modul | **`--lb-*`-Variablen** auf dem Modul-Wurzelelement |
| Fachsemantik (Ampel) | das Modul | `_lib/ampel.ts` (§6.6.2) |

```css
/* _ui/verwaltung.module.css — die Modulvariablen, beide Modi. */
.modul {
  --lb-tinte:  #1a1d20;  --lb-stahl: #5b6570;
  --lb-linie:  #d9dde1;  --lb-papier: #eef0f1;  --lb-karte: #ffffff;
  --lb-rot:    #c8000f;  /* Marke/Handlung — NICHT die Ampel, §6.6.2 */
}
:root[data-theme="dark"] .modul {
  --lb-tinte:  #ece9e2;  --lb-stahl: #9aa4ad;
  --lb-linie:  #2a2f34;  --lb-papier: #0f1113;  --lb-karte: #16191c;
  --lb-rot:    #e04452;
}
/* Auf demselben Element liegen die acht `--lb-ampel-*`-Variablen (§6.6.2a) — eine Leitung
   für beide Sorten, damit es nicht zwei Wege ins CSS gibt. */
```

⚠️ **Drei Regeln, ohne die aus Option (c) genau die Kollision aus Falle 2 und Falle 5 wird:**

1. **`--ant-*` kommt in eigenem Markup nie vor.** antd deklariert seine Variablen auf **seiner
   Scope-Klasse**, nicht auf `:root`; eigenes Markup außerhalb eines antd-Komponentenbaums sieht sie
   nicht, und der Fehler ist **still** — `var(--ant-color-border-secondary)` löst ins Leere auf und
   die Haarlinie verschwindet einfach. `shell-css.test.ts:97-98` und `not-found.test.tsx:92-93`
   verbieten das repo-weit.
2. **`--lb-*` kommt in antd-Props nie vor.** Die Gegenrichtung ist keine Falle, aber eine zweite
   Wahrheit: eine `Card` mit `style={{ background: "var(--lb-karte)" }}` weicht im Dunkelmodus von
   jeder anderen `Card` der Suite ab, ohne dass jemand es beabsichtigt hätte.
3. **Der Umschalter ist `<html data-theme>`, nicht `prefers-color-scheme`.** Auf
   `prefers-color-scheme` zu selektieren ist **falsch**: es bricht den Fall „System dunkel,
   Umschalter hell" (`docs/design/README.md:105-118`, §7.1.1).

#### 6.6.7 Dunkelmodus — acht Flächen invertieren heute fest gegen Hell

`globals.css` hat genau drei `@media`-Blöcke: `:160` (`prefers-reduced-motion`), `:250`
(`max-width:760px`), `:275` (print). **Kein `prefers-color-scheme`, kein `data-theme`, kein
Dunkel-Gegenstück zu den zwölf Farben.** Fest gegen Hell gebaut sind acht Stellen; fünf davon liegen
in der Verwaltung oder in geteilten Bausteinen:

| Stelle | Beleg | Auflösung |
|---|---|---|
| `.side` (Grund `--tinte`, Text `#fff`) | `globals.css:180` | **entfällt** mit `SideNav` |
| `.btn-tinte` | `globals.css:67` | `Button` (Vorgabestil) |
| `.input` (`background:#fff`, **ohne Variable**) | `globals.css:80` | `Input` |
| `.combo-input` (dito) | `globals.css:83` | `Select` |
| `.etikett` (`background:#fff`) | `globals.css:266` | bleibt **absichtlich** weiß — es ist Papier (§6.10, §8.4) |
| `Plakette.tsx:32` (`fill="#fff"`) | | `--lb-karte` (§6.4.8) |
| `.summary` | `globals.css:162` | Helfer-Weg (§7) |
| `BarcodeScanner.tsx:113` (Inline-Style `background:"#000"`) | | bleibt schwarz — es ist ein Kamerabild, und **kein CSS-Scan findet diese Stelle** |

Die Rechnung ist damit klein: von den acht Stellen verschwinden fünf mit ihrem Baustein, zwei bleiben
absichtlich fest (Papier und Kamerabild), und eine — die Plakette — wird auf Modulvariablen umgestellt.
**Was bleibt, sind die zwölf Farbrollen als Paar** (§6.6.6). ⚠️ *Kein Gate:* alle acht Stellen sind
syntaktisch einwandfrei, und **kein Gate der Suite rendert ein Modul im Dunkelmodus**. Die Zusicherung
gehört deshalb in §12.4: ein echter Abruf je Modus auf mindestens `/verwaltung/artikel` (Tabelle),
`/verwaltung/verfall` (Plakette und Chips) und `/verwaltung` (KPI-Kacheln).

---

### 6.7 Typografie — Entscheidung 32

#### 6.7.1 Die Verwaltung bekommt Geist, der Helfer-Weg behält die Anmutung

`src/app/layout.tsx:2` lädt heute Barlow, Barlow Condensed und IBM Plex Mono über `next/font/google`;
`:6-24` definiert `--font-body`/`--font-display`/`--font-mono`, `globals.css:32-34` leitet sie
weiter. In `globals.css` stehen **21** verschiedene px-Schriftgrößen, davon liegen fünf auf antds
Leiter (12/14/16/20/24/30, `docs/design/README.md:150-151`). Die Halbpixelwerte (10,5 / 11,5 / 12,5 /
13,5 / 14,5) sind kein Versehen — sie stehen wortgleich schon im Mockup.

**Entschieden, zweigeteilt entlang der beiden Gestaltungsklassen:**

- **Verwaltung (`(arbeit)` und `(druck)`): Geist Sans und Geist Mono, also der Suite-Standard.** Die
  drei Google-Schriften werden dort **nicht** registriert.
- **Helfer-Weg, Gate, `/a` (öffentliche Ansichtsklasse): Barlow Condensed bleibt als
  `--lb-display`, modul-lokal registriert nach dem Muster
  `m/feedback/f/[slugSecret]/Zustaende.tsx:2` (`Newsreader` in einer Komponente, angewandt auf einem
  eigenen Wrapper).** Barlow als Fließtext und IBM Plex Mono fallen auch dort; `--lb-body` ist Geist
  Sans, `--lb-mono` ist Geist Mono.
- ⚠️ **`/g/<code>` steht auf der ersten Seite dieser Aufteilung, nicht auf der zweiten.** Es trägt
  `_ui/VerwaltungsRahmen.tsx` und ist damit Verwaltungsansicht (§2.9); seine einzige gerenderte
  Fläche bekommt Geist wie jede andere Verwaltungsseite.

**Warum die Trennung und nicht eine Antwort für beides:**

1. **Die beiden Klassen sind absichtlich verschieden** (`docs/design/README.md:15-21`): öffentliche
   Ansichten „dürfen eigenständig aussehen"; Admin-Ansichten „gehören sichtbar zur Suite". Die
   Verwaltung ist eine Admin-Ansicht neben portal, qr, feedback und files — eine eigene Schriftfamilie
   machte lagerbuch dort zum Fremdkörper, und zwar auf jeder Seite.
2. **Die Wortmarke, die die Wiedererkennung trägt, steht gar nicht mehr in der Verwaltung.** Sie
   verschwindet dort mit dem Modul-Layout (§6.1.2). Der Ort, an dem „LAGERBUCH" in Barlow Condensed
   das Erste ist, was jemand sieht, ist das Gate und der Helfer-Rahmen — also genau die Klasse, die
   sie behält (§7.1).
3. **Die Display-Rolle trägt in der Verwaltung Struktur, nicht Marke.** Sie liegt auf `.cardtitle`
   (`globals.css:49`), `.label` (`:101`), `.secthead` (`:199`), `.tbl th` (`:207`), `.mainhead h1`
   (`:197`), `.kpi b` (`:204`), `.bignum` (`:56`), `.fachhead` (`:167`). Das ist die Unterscheidung
   zwischen Struktur und Inhalt — und die lässt sich mit Größe, Gewicht, Laufweite und Versalien
   ebenso ausdrücken wie mit einer zweiten Schriftfamilie (§6.7.2).

⚠️ **Annahme, benannt statt versteckt:** die drei Schriften sind **keine** CD-Vorgabe. Betreiberfrage
29 ist unbeantwortet; das Repo enthält keinen Hinweis darauf, dass sie gebunden wären. **Falls doch**,
kehrt sich nur der erste Spiegelstrich um, und die Kosten sind gering: eine modul-lokale
Schriftregistrierung nach demselben Muster wie im Helfer-Weg plus die Zuweisung von `--lb-display` in
`_ui/verwaltung.module.css`. Die Rollen (§6.7.2) bleiben dieselben, weil sie als Rollen definiert sind
und nicht als Schriftnamen.

#### 6.7.2 Rollen statt Werte

`docs/design/README.md:149-152` verlangt „eine Datei mit fertigen `CSSProperties` je Rolle, statt
Schriftgrößen im Markup zu verstreuen", und in Admin-Ansichten „antds eigene Leiter" — „eine dritte
Skala im Produkt wäre der Fehler, nicht die Lösung".

```ts
// src/app/m/lagerbuch/_lib/schrift.ts — KEIN "use client" (Falle 6: Server Components lesen das hier).
import type { CSSProperties } from "react";

export const SCHRIFT = {
  /** Seitentitel — ersetzt `.mainhead h1` (24px Barlow Condensed versal). */
  titel:    { fontSize: 24, fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1.2 },
  /** Abschnittsüberschrift — ersetzt `.secthead` und `.cardtitle`. */
  abschnitt:{ fontSize: 12, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" },
  /** Feldbeschriftung — ersetzt `.label`. */
  feldname: { fontSize: 12, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase" },
  /** Fließtext und Tabelleninhalt. */
  text:     { fontSize: 14 },
  /** Nebentext — ersetzt `.rowmeta small`, `.cardnote`, `.mainhead p`. */
  neben:    { fontSize: 12 },
  /** Große Zahl — ersetzt `.bignum`, `.kpi b`, `.tbl .num`. */
  zahl:     { fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 },
  /** Fachinformation in Mono — Fachnummern, Journalzeilen, Zugangs-Codes. */
  mono:     { fontFamily: "var(--font-geist-mono)", fontSize: 12, fontVariantNumeric: "tabular-nums" },
} satisfies Record<string, CSSProperties>;
```

**Die 21 Größen werden auf sechs.** Alle Werte liegen auf antds Leiter; die Halbpixelwerte fallen.
Die Versalien-plus-Laufweite-Kombination ist das, was die Display-Rolle tatsächlich geleistet hat —
sie überlebt als Eigenschaft, nicht als Schriftfamilie.

#### 6.7.3 Ziffern und Eingabefelder — zwei harte Zahlen

**`font-variant-numeric: tabular-nums` ist Pflicht, überall dort, wo Ziffern verglichen werden.**
Der Grund ist messbar: im gesamten lagerbuch-Repo kommt `font-variant-numeric` bzw. `tabular-nums`
**null** Mal vor — die Ziffernausrichtung hängt heute allein an IBM Plex Mono. Fällt die weg, wandern
Bestandszahlen in einer Tabellenspalte gegeneinander, und `docs/design/README.md:154` verlangt es
ausdrücklich. Betroffen: jede Zahlenspalte jeder `Table`, die KPI-Zahlen, `InputNumber`, die
Journal-Deltas, die Ziffern der Plakette, die Druckangaben (bar, %, Stück). Für den Helfer-Weg sagt
§7.7.4 dasselbe.

**Kein Eingabefeld unter 16px.** Die Suite sperrt den Zoom (`src/app/layout.tsx`, `viewport`-Export
mit `maximumScale: 1, userScalable: false`) und zieht deshalb eine 16px-Untergrenze
(`src/app/globals.css`, `input, textarea, select { font-size: 16px }`); beide Regeln sind
**ausdrücklich eine Einheit** (`docs/design/README.md:167-171`) — ohne Zoom kann niemand mehr
heranholen, was zu klein ist. lagerbuch hat heute **keine** von beiden und liegt bei 13–15px.

⚠️ **Der Riegel dagegen hat zwei Lücken, und die Verwaltung trifft beide** — das ist eine Lücke in
einem **Suite**-Gate, kein Modulbefund, und wer den grünen Test als bestandene Prüfung liest,
portiert drei zu kleine Felder in eine Anwendung ohne Zoom:

1. `core/theme/feldschrift.test.ts:114-141` liest ausschließlich die **Langform**
   `/font-size:\s*(\d+)px/`. `.input { … font: 500 14px var(--body) … }` (`globals.css:80`) und
   `.combo-input` (`:83`) — zusammen die Träger von 56 `<input>` und 16 Comboboxen — setzen ihre 14px
   über die **font-Kurzschreibweise** und passieren grün.
2. Er filtert nach dem Selektortext (`/\b(input|textarea|select)\b|\.ant-select-selector/`).
   `.stepper.sm .stepval { … font-size: 15px }` (`globals.css:76`) nennt kein Eingabeelement, obwohl
   `.stepval` in `Stepper.tsx:52` ein echtes `<input type="text" inputMode="numeric">` ist — das
   Mengenfeld der Verwaltung, 15px.

Gefangen wird genau **eines**: `.verfallfeld .input { font-size: 13px }` (`globals.css:110-113`), und
dessen Kommentar nennt den Grund („kompakt, damit Menge und Datum in einer Zeile bleiben"). Das Feld
gehört zur Zählzeile des Fahrzeug-Checks und damit dem Helfer-Weg; §7.7.2 hat es auf 18px gehoben und
die Einzeiligkeit aufgegeben. **Für die Verwaltung folgt daraus:** `.input` und `.combo-input`
verschwinden ohnehin mit `Input`/`Select` (§6.4.10), und der Stepper wird `InputNumber` (§6.4.6) —
alle drei Lücken schließen sich durch den Bausteintausch. **Verbindlich bleibt trotzdem die Regel**,
weil das Modul-CSS neue Felder einführen könnte: kein Selektor unter `m/lagerbuch/` setzt eine
Schriftgröße unter 16px auf ein Eingabeelement, weder in Lang- noch in Kurzschreibweise.

---

### 6.8 Was aus `globals.css` wird — 283 Zeilen in drei Eimer

#### 6.8.1 Die Ausgangslage

`src/app/globals.css` ist **21.160 Byte in 283 Zeilen** und löst rund 140 selbst definierte
Klassen-Tokens auf, gegen die im Repo **915 `className`-Attribute** stehen. Die Suite hat dem 40
Zeilen entgegenzusetzen (`iuk-suite/src/app/globals.css`) — und der Kopfkommentar sagt, warum:
„Alles Thematische steckt jetzt in `src/core/theme/` und kommt über antds ConfigProvider als
CSS-Variablen. Hier bleibt nur, was kein Komponenten-Theme abdecken kann."

Die 283 Zeilen zerfallen in drei Eimer, und die Zuordnung ist die eigentliche Arbeit dieses
Abschnitts. **Was hier nicht auftaucht, existiert nach dem Port nicht** — das ist ausdrücklich so
gemeint: eine übrig gebliebene CSS-Regel ohne Verwender ist die Sorte Ballast, die die nächste
Aufräumrunde entweder mitschleppt oder mitsamt einer noch benutzten Nachbarregel entfernt.

#### 6.8.2 Eimer A — es gibt ein antd-Gegenstück, die Regel entfällt ersatzlos

| Zeilen | Klassen | Ersatz |
|---|---|---|
| 37–39, 41 | Reset, `button`, `input` | `iuk-suite/src/app/globals.css` (Reset) und antd |
| 46–48 | `.card`, `.card + .card`, `.cardpad` | `Card` |
| 50–55 | `.row`-Familie | `Table` bzw. eigenes Zeilenmarkup in `Card` (§6.4.2) |
| 64–71 | `.btn`-Familie inkl. `.btn.slim` (54 Verwendungen), `.btn-rot`, `.btn-tinte`, `.btn-ghost`, `.btnrow` | `Button`, `Space` |
| 72–76 | `.stepper`-Familie | Verwaltung: `InputNumber` (§6.4.6). Der Helfer-Stepper wird in `helfer.module.css` neu geschrieben (§7.7.3) |
| 77–79 | `.filter`, `.filter.on`, `.filters` | `Checkbox`/`Checkbox.Group` (§6.4.4) |
| 80 | `.input` | `Input` |
| 82–93 | die zwölf `.combo-*`-Zeilen | `Select showSearch` (§6.4.3) |
| 95–99 | `.filterleiste`, `.suchfeld` | `Space`/`Flex` + `Input` (§6.9.2) |
| 179–186 | `.adm`, `.side`, `.snav`, `.sitem`, `.sitem.on` | `Shell` + `SuiteNav` (§6.3) |
| 187–193 | `.main` und die drei Dichteregeln darunter | `Content` der `FullShell` (`SPACE.lg`) |
| 206–213 | `.tbl`-Familie inkl. `tr.click`, `.num`, `.mono` | `Table` (§6.4.1) |
| 214–215 | `.drawerdim`, `.drawer` | `Drawer` |
| 221–228 | `.addrow`, `.input.qty`, `.btn-icon` | `Space.Compact` **in einer Client-Insel** (Compound, Falle 1) + `Button icon` |
| 233–238 | `.modaldim`, `.modalbox`, `.modalhead`, `.modalsub`, `.modalnote` | `Modal` (Hülle; das Innenleben §6.4.5) |
| 247 | `.grid2` | `Row`/`Col` mit `xs`/`md` |
| 250–262 | der gesamte `@media (max-width:760px)`-Block | entfällt (§6.8.6) |

**Zusammen rund 105 Zeilen.**

#### 6.8.3 Eimer B — ersatzlos streichen, weil sie schon heute nichts tun

**Nachgeprüft**, nicht übernommen: für jede dieser Klassen gibt es **kein einziges Vorkommen** in
irgendeiner `.tsx` unter `src/` (`grep` über den Arbeitsbaum bei `ca04eb1`):

| Zeile | Klasse | |
|---|---|---|
| 43 | `.root` | Mockup-Wurzel, nie gerendert |
| 104 | `.strike` | |
| 105 | `.demochip` | Rest der Mockup-Demokennzeichnung |
| 106 | `.toast` | ⚠️ hier stand einmal eine Meldungsfläche — heute meldet das Modul über Text an Ort und Stelle |
| 151–157 | `.scanwrap`, `.scanframe`, `.scancorner`, `.sc-tl`…`.sc-br` | der **Rahmen** um das Kamerabild |
| 161 | `.scanhint` | |
| 168–169 | `.sheetdim`, `.sheet` | das halb abgeräumte Bottom-Sheet-Muster |
| 186 | `.sitem .cnt` | ein roter Zähler-Badge je Navigationseintrag, nirgends verwendet — die ursprüngliche Absicht war offenbar „Verfall: 7" |
| 248 | `.vehchips` | |

**Zusammen rund 16 Zeilen.** Zwei Nachbarn, die **nicht** dazugehören und die man beim Aufräumen
mitnimmt, wenn man nur den Abschnittsnamen liest:

- **`.scanline` (`:158`) lebt** — `BarcodeScanner.tsx:120` rendert sie, und sie trägt den
  `prefers-reduced-motion`-Zweig (`:159-160`). Sie gehört zum Helfer-/Scanner-CSS (Eimer C).
- **`.sheettitle` (`:170-171`) lebt, und zwar kräftiger als die Analyse annahm.** Nachgezählt:
  **neun Verwendungen in sieben Dateien**, alle in der Verwaltung — `ArtikelDrawer.tsx:153,168,187`,
  `NeuArtikel.tsx:38`, `NeuFahrzeug.tsx:30`, `NeuGeraet.tsx:21` (Geräte), `NeuGeraet.tsx:40` (BZ),
  `NeuFlasche.tsx:38`, `NeuToken.tsx`. Die Analyse nennt „drei Verwendungen"; **das ist zu wenig**.
  Sie ist die Titelzeile jedes Anlege-Formulars und wird zur `title`-Prop von `Modal` bzw. `Drawer`
  — also Eimer A, nicht Eimer B. ⚠️ Und sie ist zugleich der Ersatzanker aus §6.11: der `title` ist
  der zugängliche Name, über den `getByRole("dialog", { name })` greift.

#### 6.8.4 Eimer C — muss als Modul-CSS überleben

Alles, was **eigenes Markup** einfärbt oder anordnet, für das antd keinen Baustein hat. Ablageort:
`_ui/verwaltung.module.css` (Verwaltung) und `_ui/helfer.module.css` (§7); die Druckregeln des
Etikettenbogens liegen **nicht** hier, sondern in `(druck)/druck.css` (§8.4, §6.10). Die
`--lb-*`-Variablen liegen auf dem Wurzelelement (§6.6.6).

| Zeilen | Was | Warum es bleibt |
|---|---|---|
| 40 | `button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid …; outline-offset: 2px }` | ⚠️ **Die Suite-Regel erreicht nur antd-Komponenten.** Eigenes Markup (Chip-Zeilen, Etikett-Kacheln, Brotkrume, Scanner-Knopf) braucht seinen eigenen sichtbaren Fokus — `docs/design/README.md:143` lässt „nie `outline: none` ohne Ersatz" ohne Ausnahme gelten. Wandert **zeichengleich** ins Modul-CSS (§7.7.4 sagt dasselbe für den Helfer-Ast) |
| 49, 101, 167, 197, 199 | `.cardtitle`, `.label`, `.fachhead`, `.mainhead h1`, `.secthead` | werden zu Rollen in `_lib/schrift.ts` (§6.7.2) — die **Regel** entfällt, die **Aussage** bleibt |
| 56–58 | `.bignum`, `.fach` | `.fach` ist die Fachnummer im Handlager, ein Mono-Kästchen mit Rahmen — kein antd-Baustein trifft das |
| 59–63 | `.chip` und die vier Tonwerte | §6.6.3 — mit den neuen Ampelwerten |
| 100 | `.filtertreffer` | die „X von Y"-Anzeige (§6.9.5) |
| 102–103 | `.footnote`, `.empty` | `.empty` wird `Empty`; `.footnote` bleibt (Mono-Fußnote unter Listen) |
| 107–109 | `.checkcircle`-Familie | Fortschrittskreis im Check — Helfer-Weg |
| 111–113 | `.verfallfeld` | Helfer-Weg, §7.7.2 (13px → 18px) |
| 116–176 | Gate und Helfer-Vollbild-App | **§7**, `helfer.module.css` |
| 158–160 | `.scanline` und ihr `prefers-reduced-motion`-Zweig | die einzige Animation des Moduls |
| 172–176 | `.journal`, `.jts`, `.jdelta` | die Mono-Journalzeile und die Vorzeichenfarbe (§6.6.5) |
| 194–195 | `.backlink` | die Brotkrume der neun Detailseiten (§6.3.3) |
| 201–205 | `.kpis`, `.kpi`-Familie | §6.6.4 — Kante und Anordnung |
| 218–219 | `.card .fachhead` (Fach-Gruppierungsstreifen) | trennt Fächer innerhalb einer Liste; `Table` kann Gruppenzeilen nicht ohne eigenes Markup |
| 229–230 | `.cardrow`, `.cardnote` | |
| 239–240 | `.warnbox`, `.infobox` | §6.6.5 — mit Ampelfarben statt Suite-Rot |
| 243–246 | `.gefahr`-Familie | die abgesetzte Löschzone |
| 264–283 | Etiketten, Bildschirm **und** Druck | §8.4 — vollständig umgeschrieben in `(druck)/druck.css`, nicht kopiert (§6.10) |

**Zusammen rund 100 Zeilen, davon etwa 60 im Helfer-CSS und 40 im Verwaltungs-CSS** (die
Etikettenzeilen kommen zu `druck.css`). Die Rechnung geht damit auf: 105 (A) + 16 (B) + 100 (C) ≈ 220
Zeilen, der Rest sind Leerzeilen, Kommentare und der `@theme`/`:root`-Block (`:1-35`), der komplett
durch `core/theme` und die `--lb-*`-Variablen ersetzt wird.

#### 6.8.5 Die Spezifitätsregel — Falle 5, und wie sie hier konkret zuschlägt

„Eigenes CSS und antd-CSS treffen sich, und die Spezifität entscheidet — meist gegen dich. Der Fehler
ist immer still: im Quelltext steht alles richtig, die Regel matcht, sie greift nur nicht."
(`docs/design/README.md:64-66`). Drei Ausprägungen sind der Suite bereits passiert; **die
Verwaltungsoberfläche hat für alle drei einen Kandidaten:**

| Ausprägung | Konkreter Kandidat hier | Gegenmaßnahme |
|---|---|---|
| **Gleichstand, antd gewinnt durch Reihenfolge** | eine Modulklasse (0,1,0) auf einem `Button`, `Tag` oder `Input` — antds Stylesheet kommt später | eine Klasse voranstellen (`.modul .chip` = (0,2,0)) — **nie** `!important` |
| **Eigene Regel zu schwach** | die 16px-Untergrenze der Suite ist ein Elementselektor (0,0,1) und verliert gegen `.ant-input-lg` (0,1,0) — **hier bereits gelöst** durch `:root .ant-select-selector` in der Suite-`globals.css`, die einzige bewusst eingegangene Kopplung an einen antd-Klassennamen | nicht nachbauen, nicht erweitern: **es bleibt bei dieser einen** (§12.3, Regel 1) |
| **Eigene Regel zu stark, trifft die falschen** | ein `:root .modul svg { … }` für die Ikonen träfe auch die SVGs **innerhalb** von antd-Komponenten und die QR-Codes der Etiketten | Selektoren an die Modul-Klasse binden, nie an `:root` allein |

**Und die Regel darüber:** wo antd einen **Token** anbietet, ist der Token besser als jede
Spezifität (`docs/design/README.md:82-83`). Für dieses Modul heißt das konkret: Zeilenhöhen,
Feldschriftgrößen, Rundungen und Abstände kommen aus `core/theme/theme.ts` bzw. `SPACE`, nicht aus
Modul-CSS. **Jede Spezifitätserhöhung wird kommentiert** — sonst entfernt sie die nächste
Aufräumrunde als vermeintlichen Ballast (`:84-85`).

⚠️ **Prüfen kann das nur ein echter Browser.** Ein Quelltext-Scan findet eine Kaskadenkollision
strukturell nicht, weil er Reihenfolge und Fremd-Stylesheets nicht kennt (`:225-228`). Was er
festhalten kann, ist die Gegenmaßnahme (der Selektor trägt den Präfix); ob sie wirkt, weiß nur der
Abruf aus §12.4.

#### 6.8.6 Der Breakpoint — 760px wird 767.98px, und die Umschaltung wird zu antds Raster

`globals.css:250` ist die **einzige** breitenabhängige Medienabfrage des Moduls und schaltet bei
**760px**: `.side` von 218px sticky auf waagerecht scrollend (`:252-255`) und `.main` von
`padding: 20px 24px 48px` (`:187`) auf `14px 12px 48px` (`:257`). Die Suite schaltet bei **768px**
(`docs/design/README.md:159`, festgehalten in `core/shell/shell-css.test.ts`).

**Im Fenster von 760,01 bis 767,98px** zeigt die Shell bereits ihre mobile Fassung, während lagerbuchs
Verwaltung noch auf die Desktop-Fassung umschaltet. Das ist buchstäblich der Fehler, den `feedback.css`
bis 2026-07-27 hatte (600 statt 768) und den `docs/design/README.md:192-197` als „bei 390px nicht zu
unterscheiden — und dazwischen kaputt" beschreibt.

**Entschieden:**

1. **Der gesamte 760px-Block entfällt** (Eimer A). Seine drei Aufgaben übernehmen: die Shell (Leiste
   → Drawer), `Content` mit `SPACE.lg` (Innenabstand) und `Row`/`Col` mit `xs`/`md` (KPI-Raster).
2. **`_ui/verwaltung.module.css` enthält damit im Regelfall gar keine Medienabfrage.** Wenn eine
   nötig wird, heißt sie **`max-width: 767.98px`** — nicht 768: bei exakt 768px gälten sonst beide
   Seiten und die Stylesheet-Reihenfolge entschiede.
3. **Der Riegel dazu ist bereits in §7.7.1 beschlossen** und deckt diese Datei mit ab. ⚠️ **Mit einer
   Korrektur am Glob:** der Scan läuft über **alle** `.css`-Dateien unter `m/lagerbuch/**`, nicht nur
   über `_ui/*.module.css` — sonst lässt er ausgerechnet `(druck)/druck.css` aus, die einzige Datei
   des Moduls mit `@page` und `@media print` (§6.10.2, §8.4). Er hält fest, dass
   `helfer.module.css` **keine** `@media (max-width` enthält und jede vorhandene `max-width`-Abfrage
   `767.98` schreibt.
   ⚠️ *Kein Gate darüber hinaus:* jsdom wertet Media Queries nicht aus; ein Vitest, der „auf 390px
   ist X unsichtbar" behauptet, geht **immer** durch. Playwright bei 390px und bei 1280px besitzen die
   Ergebnisse — und **Playwright dazwischen** besitzt genau diesen Befund, weil er an keinem der
   beiden Enden sichtbar ist.

---

### 6.9 Suchen und Filtern — zwei Regime, und was in der Oberfläche daraus wird

#### 6.9.1 Der Unterschied ist eine Datenfrage, keine Stilfrage

Das Modul hat **zwei** Filterregime, und wer sie in der Oberfläche vermischt, baut einen Datenfehler:

- **Regime A — clientseitig, über eine vollständig geladene Liste.** Sechs Listen bekommen ihre
  Zeilen komplett vom Server und filtern in `useMemo` im Browser. Der Zustand lebt in `useState`,
  überlebt kein Neuladen, ist nicht teilbar, steht in keiner URL (§6.9.4).
- **Regime B — serverseitig, Zustand in der URL.** Zwei Verwaltungsseiten filtern über
  `searchParams`, **damit die Suche über die gesamte Historie geht und nicht nur im geladenen
  Ausschnitt** — der Grund steht als Kommentar in `queries.ts:82-85` und in `JournalFilter.tsx:16-19`
  (§6.9.2).

Das Regime hängt an der Datenmenge, nicht am Geschmack: Regime A funktioniert, solange die ganze
Liste in den Browser passt (Artikelstamm, Flotte, Geräte); Regime B ist Pflicht, wo dahinter eine
wachsende Historie liegt (Journal, Check-Historie). **Verbindlich: kein Regimewechsel beim Port.**
Wer die Journalsuche „vereinheitlichen" und in antds `Table`-eigene Filter legen wollte, suchte
danach in den geladenen 100 Zeilen statt in der Historie — und die Suche fände nichts, was älter ist
als die letzten hundert Buchungen, ohne dass jemand es merkt.

#### 6.9.2 Regime B — die Filterleiste in antd

Die Parameter und ihr Vertrag sind in §5.14.1 entschieden und werden hier **nicht** neu verhandelt:
`q`, `typ`, `von`, `bis` fürs Journal (`journal/page.tsx:13`), `fz`, `von`, `bis` für die Checks
(`checks/page.tsx:13`); `router.replace` statt `push`; `useUrlFilter` liegt in `_ui/` (§2.1). Was
**dieses** Kapitel entscheidet, ist die Bauform:

```tsx
// _ui/JournalFilter.tsx — "use client".
<Flex gap={SPACE.md} wrap align="center">
  <Input type="search" prefix={<Ikone name="lupe" />} … />   {/* NICHT Input.Search — siehe 1. */}
  <Select …/>               {/* typ, gegen die Weißliste */}
  <DatePicker …/> <DatePicker …/>
  <Button onClick={reset}>Zurücksetzen</Button>
  <span className={s.filtertreffer}>…</span>
</Flex>
```

Fünf Festlegungen, und drei davon sind Fallen:

1. ⚠️ **`Input.Search` ist ein Compound-Zugriff** und darf nur in einer Client-Insel stehen (Falle 1)
   — hier steht es in einer, also ist es zulässig. **Aber es ist trotzdem falsch**, und zwar aus
   einem zweiten Grund: `Input.Search` bringt einen Absendeknopf mit, und das Feld soll gerade
   **nicht** abgesendet werden, sondern debounced navigieren. Verbindlich ist ein schlichtes
   `<Input type="search" />` mit Lupe als `prefix`.
2. ⚠️ **Die Rolle `searchbox` entsteht allein aus `type="search"`.** `suche-filter.spec.ts:15,28`
   greift `role=searchbox`, und heute entsteht sie aus `Filterleiste.tsx:106`
   (`<input className="input" type="search" …>`). Wer das Bauteil ersetzt und nur `placeholder` und
   `aria-label` mitnimmt, bekommt `textbox` — **beide** Tests brechen, und zwar still im Sinne von
   „Selektor findet nichts" (§12.3, Regel 2). Also: `type="search"` ausdrücklich setzen und die Rolle
   **einmal gegen das gerenderte Bauteil prüfen**, nicht gegen die Absicht.
3. **Der `committedQ`-Tanz wandert unverändert mit.** `JournalFilter.tsx:29-36` merkt sich in einem
   Ref, welchen Suchbegriff die Komponente zuletzt selbst in die URL geschrieben hat, und
   unterscheidet damit eine **externe** `q`-Änderung (geteilter Link) von einer selbst ausgelösten:
   extern wird die Eingabe nachgezogen, selbst ausgelöst passiert nichts — sonst verlöre das Feld
   beim Tippen den Fokus. Der Debounce steht bei **300 ms** (`:48-51`). Ein antd-`Input` bringt
   nichts davon mit. ⚠️ **Und die Zeile, die man beim Portieren gerne „aufräumt":**
   `JournalFilter.tsx:40-41` schreibt bei jedem Chip- und Datumsklick das **bereits Getippte** als
   `q` mit. Ohne sie verliert ein Datumsklick den halb getippten Suchbegriff.
4. **`ZeitraumFelder` werden zwei `DatePicker`, nicht ein `RangePicker`.** Das ist **kein** Tausch,
   sondern die Vermeidung einer Bedeutungsänderung: heute sind `von` und `bis` zwei **unabhängige**
   URL-Parameter, einzeln setzbar und einzeln leer (`Filterleiste.tsx:39-75`), mit gegenseitiger
   Begrenzung über `max` (`:58`) und `min` (`:69`). Ein `RangePicker` macht daraus ein **Wertepaar**
   — „nur ab dem 1.3." wäre nicht mehr ausdrückbar, und §5.14.2 verlangt ausdrücklich, dass eine
   einzeln ungültige Grenze einzeln wegfällt und einzeln gemeldet wird. Zwei `DatePicker` mit
   `disabledDate` bilden die heutige Semantik ab; die gegenseitige Begrenzung geht **nicht**
   verloren, sie wechselt nur den Träger.
5. **Die Hinweise aus `zeitraumAus` stehen an der Filterleiste**, als Text mit 3px linker Kante —
   **kein `Alert type="error"`** (§6.6.5). Sie sind eine Aussage über die Adresszeile, keine
   Störung: „Das Datum in der Adresse ist ungültig und wurde ignoriert."

#### 6.9.3 Die 100er-Grenze — übernehmen und sichtbar machen; **keine** Pagination, **kein** Infinite Scroll

**Ratifiziert: Option (a) aus Entscheidung 35, wie in §5.14.3 entschieden.** Die Deckel bleiben
(Journal 100, `queries.ts:87`; Check-Historie 50, `queries.ts:350`; BZ-Logbuch 100, `bz.ts:124`), die
Abfrage holt `limit + 1`, angezeigt werden `limit`, und der Beschreibungstext wird **bedingt**. Für
die Oberfläche folgt daraus:

| Heute | Verbindlich |
|---|---|
| `journal/page.tsx:32` schreibt „Zeigt die neuesten 100 Treffer" **unbedingt** in die Seitenbeschreibung — auch wenn drei Zeilen zurückkommen | bei `mehrVorhanden`: „Neueste 100 von mehr Treffern — Zeitraum eingrenzen"; sonst „N Treffer" |
| Die Checks-Seite nennt ihre 50 **an keiner Stelle** | derselbe bedingte Satz mit 50 |
| Die Trefferanzeige (`Filterleiste.tsx:131`) erscheint auf **keiner** der beiden Seiten | sie erscheint auf beiden (§6.9.5) |

**Warum keine Pagination.** Ein `<Table dataSource={journal} />` **ohne** `pagination`-Angabe erzeugt
von selbst genau die Variante, die Entscheidung 35 ausdrücklich ausschließt: einen Seitenumbruch über
einem **Ausschnitt**. Der Pager sagt dann „10 von 100", während dahinter fünftausend Zeilen liegen —
das sieht nach Vollständigkeit aus und ist eine Falschaussage über die Datenmenge. **Deshalb ist
`pagination={false}` auf diesen beiden Tabellen keine Formalie, sondern die Aussage selbst**, und
deshalb steht die Regel „jede `Table` setzt `pagination` ausdrücklich" (§6.4.1) in diesem Kapitel und
nicht in einem Stilleitfaden.

**Warum kein Infinite Scroll.** Nachladen beim Scrollen setzt einen stabilen Cursor voraus. Die
Sortierung ist bis §5.14.4 ohne Tiebreaker (`orderBy(desc(buchungen.ts))`, `queries.ts:109`), und die
Spalte speichert **Sekunden**, während ein Check-Abschluss mehrere Buchungen in derselben Sekunde
schreibt. Ohne `desc(buchungen.id)` als Zweitkriterium können an einer Nachladegrenze Zeilen doppelt
erscheinen oder ausfallen — aus einem stillen Sortierärgernis würde ein Datenfehler. §5.14.4 setzt den
Tiebreaker; damit **wäre** Cursor-Nachladen baubar, und es bleibt der benannte Weg für später
(Entscheidung 35, Option (d), „sobald die reale Journalgröße bekannt ist", Betreiberfrage 34). Für
den Cutover ist es Aufwand ohne belegten Bedarf.

⚠️ **Die Checks-Grenze ist der strengere Fall, nicht der harmlosere.** Ihre 50 sind heute nirgends
genannt; wer nur das Journal anfasst, lässt die Seite zurück, die ihre Unvollständigkeit gar nicht
erwähnt.

#### 6.9.4 Regime A — sechs Listen, sechs verschiedene Suchfelder

Die sechs clientseitig gefilterten Listen suchen über **verschiedene** Feldmengen, und das ist kein
Zufall, sondern Bedienpraxis: nach einem Barcode sucht man bei Geräten, nach einer Kennung bei
Fahrzeugen, nach einer Chargennummer bei Artikeln.

| Liste | Freitext sucht über | Filter | Vorgabe |
|---|---|---|---|
| `ArtikelTable.tsx:112-122` | Name · Fach · Chargennummer der nächsten Charge | unter Mindestbestand · Charge kritisch · inaktive ausblenden (`:149-152`) | Sortierung `name-asc` (`:108`), sechs Sortierungen (`:30-36`), Zweitkriterium immer Name (`:41`) |
| `GeraeteListe.tsx:16-24` | Name · Barcode · Lagerort | Medizin · Objekt (Mehrfachauswahl) · nur fällige · inaktive ausblenden (`:29-33`) | Reihenfolge aus `geraete.ts:47` |
| `BzListe.tsx:22-30` | Name · Barcode · Lagerort | fällig/überfällig · inaktive ausblenden (`:32-35`) | Reihenfolge aus `bz.ts:104` |
| `SauerstoffListe.tsx:15-23` | Name · Lagerort | niedriger Druck · inaktive ausblenden (`:25-28`) | Reihenfolge aus `sauerstoff.ts:54` |
| `FahrzeugeListe.tsx:16-25` | Name · Kennung | unter Soll · läuft ab · inaktive ausblenden (`:27-31`) | — |
| `TokenTable.tsx:28-35` | Code · Label · Zielname | gesperrt · Fahrzeug · Artikel · Artikel-Liste (Mehrfachauswahl) (`:40-45`) | — |

⚠️ **Ein antd-`Table` mit einem globalen Suchfeld bringt diese sechs Feldmengen nicht mit — sie sind
sechs einzeln zu portierende Zusicherungen.** Verbindlich:

1. **Das Suchfeld bleibt außerhalb der Tabelle** und filtert die Datenquelle, **nicht** antds
   `column.filteredValue`. Grund ist §6.9.5.
2. **Die Vergleichsfunktion bleibt `falte`** (`_lib/suche.ts`, §5.13.2) und wird **nicht** durch
   antds Vorgabevergleich ersetzt. §5.13 besitzt die Regel; hier zählt nur, dass die Oberfläche sie
   nicht umgeht.
3. **Die Sortierungen der Artikeltabelle bleiben sechs, mit Name als Zweitkriterium.** Antds
   `sorter` je Spalte ergäbe fünf unabhängige Sortierungen ohne stabiles Zweitkriterium — und ohne
   das wandern gleichrangige Zeilen bei jedem Klick. Verbindlich: die Sortierung bleibt eine
   **eigene** Auswahl über der Tabelle (`Select`), die Spaltenköpfe tragen keine `sorter`.
4. **`toggleInSet`** (`Filterleiste.tsx:15-20`, genutzt von `GeraeteListe.tsx:27` und
   `TokenTable.tsx:38`) wandert als generische Mengenoperation nach `_lib/` — sie ist kein
   Bedienelement und hat mit der Filterleiste nur den Ablageort gemeinsam.

#### 6.9.5 Die zwei Kopplungen, die beim Neubau leicht reißen

**Erstens: die Trefferanzeige ist nicht der Pager.** `Filterleiste.tsx:131` rendert „X von Y" **nur**,
wenn `gezeigt !== gesamt`; alle sechs Listen geben sie mit (`ArtikelTable.tsx:197`,
`GeraeteListe.tsx:47`, `BzListe.tsx:48`, `SauerstoffListe.tsx:41`, `FahrzeugeListe.tsx:44`,
`TokenTable.tsx:55`). Ein antd-`Table` zeigt stattdessen einen Pager-Text — **nicht dieselbe
Aussage**: „X von Y" heißt „dein Filter blendet Y−X Zeilen aus", der Pager heißt „diese Seite von
mehreren". Verbindlich: die Trefferanzeige bleibt eigenes Markup über der Tabelle
(`.filtertreffer`, Eimer C), mit derselben Bedingung.

**Zweitens: der Excel-Export hängt am Filterzustand.** `ArtikelTable.tsx:133` ruft
`bestandExportZeilen(gefiltert)`, und `:125-126` schreibt aus, dass die Datei „genau das enthält, was
gerade in der Tabelle steht (Suche, Filter, Sortierung)". ⚠️ **Wandern Filtern und Sortieren in antds
`Table`-eigenen Zustand, muss der Export dieselbe abgeleitete Liste lesen — sonst exportiert der Knopf
still wieder alles.** Genau deshalb steht in §6.9.4 Punkt 1, dass gefiltert wird, **bevor** die Liste
in `dataSource` geht: dann gibt es nur eine abgeleitete Liste, und Tabelle wie Export lesen dieselbe.
Der Fehler wäre andernfalls maximal still — eine Datei mit mehr Zeilen sieht nicht kaputt aus, und
niemand zählt sie nach (§9.4).

---

### 6.10 Druckansichten

#### 6.10.1 Was gedruckt wird

Genau **eine** Ansicht des Moduls ist zum Drucken gebaut: der Etikettenbogen
(`/verwaltung/etiketten`). Er trägt Kacheln von 48,5 × 25,4 mm (`globals.css:265-266`) mit je einem
QR-Code (heute `.etikett img`, 20 × 20 mm, `:268`), einem Titel und einer Unterzeile; die Auswahl
geschieht über Kontrollkästchen im Bildschirm-DOM (`:269`), und `EtikettenBogen.tsx:34` ruft
`window.print()`.

⚠️ **Ab dem Port ist der QR kein `<img>` mehr.** `core/qr` liefert einen **SVG-String**, der per
`dangerouslySetInnerHTML` eingesetzt wird (§8.4, Entscheidung 8-I, Punkt 1) — das ändert den
Ersatzanker in §6.11 und verlangt die eigene Größenregel `.lb-etikettQr > svg { width: 20mm }`
(§8.4, Punkt 2), weil das `qrcode`-SVG nur eine `viewBox` mitbringt.

Alles andere wird **nicht** zum Drucken gestaltet — weder das Journal noch der Check-Detailbericht
noch der Bestellvorschlag. Der Bestellvorschlag hat stattdessen zwei Ausgabewege (CSV und
Zwischenablage, §9), und der Check-Bericht ist ein Bildschirmdokument. **Das ist eine Entscheidung,
keine Auslassung**: eine Druckansicht, die niemand druckt, ist Modul-CSS, das niemand prüft.

#### 6.10.2 Wie das Druck-CSS den Framework-Wechsel überlebt

**Der heutige Mechanismus ist Sichtbarkeitsumkehr, und er ist nicht kapselbar.**
`globals.css:277` schaltet mit `body * { visibility: hidden }` **alles** unsichtbar, `:278` blendet
nur `.etikettbogen, .etikettbogen *` wieder ein, `:279` holt den Bogen per
`position: absolute; left: 0; top: 0` aus dem Fluss und setzt `gap: 0`, `:281-282` entfernen
Abwahl-Kacheln und Bedienelemente per `display: none !important`.

Drei Gründe, warum das **nicht** mitwandern darf:

1. **CSS Modules schreiben ausschließlich Klassenselektoren um.** `body *` bleibt global — die Regel
   griffe auf **jeder** Druckseite der Suite und leerte jede andere Druckansicht (feedback-Aushang,
   files-Zugangslinks; Falle 43).
2. **`visibility: hidden` reserviert den Platz.** `Layout { minHeight: 100vh }` (`FullShell.tsx:19`)
   bliebe im Fluss und erzeugte leere Folgeseiten hinter dem Bogen. §2.9 hat deshalb die Shell
   entfernt — die Regel selbst bleibt trotzdem falsch.
3. ⚠️ **`.etikett input { display: none }` (`:282`) trifft ein Element, das es nicht mehr geben
   wird, wenn man reflexartig antd nimmt.** Ein antd-`Checkbox` rendert an dieser Stelle **kein
   nacktes `<input>`** als sichtbares Bedienelement — es rendert eine
   `.ant-checkbox-wrapper`-Struktur mit einem visuell versteckten `<input>` darin. Die Regel liefe
   ins Leere, und die Auswahlkästchen stünden mit auf dem Papier. **Still**, weil das erst am
   Ausdruck auffällt.

⚠️ **Die Bauform des Druck-CSS gehört §8.4, nicht diesem Kapitel — und sie ist gegenläufig zum
naheliegenden `files`-Muster.** Das `files`-Muster löst den Druck über
`.druckbereich { position: fixed; inset: 0; overflow: hidden }`
(`m/files/_ui/zugangslinks.module.css:143-153`). §8.4 hat es für den Etikettenbogen **verworfen**,
mit einem Beleg, der hier zählt: `files` druckt **eine** Karte, der Etikettenbogen ist N Etiketten
ohne Obergrenze (`src/db/etiketten.ts:16-17` filtert nur auf `aktiv`; bei `@page{margin:8mm}` passen
rund 40 auf ein A4-Blatt). **Mehrseitigkeit ist der Regelfall**, und `position: fixed` mit
`overflow: hidden` schneidet alles ab Seite zwei ab — still, auf gekauftem Material. Verbindlich ist
deshalb `verwaltung/(druck)/druck.css` aus §8.4: ein **gewöhnliches** Stylesheet (kein CSS-Modul) mit
`lb-`-präfigierten Klassennamen, `@page { margin: 8mm }`, `print-color-adjust: exact`,
`.lb-nichtDrucken`, `.lb-etikettAbgewaehlt` und den festen Werten `#fff`/`#000`.

Vier Festlegungen, die **dieses** Kapitel dazu beisteuert:

1. **Die Auswahl ist ein eigenes `<input type="checkbox">`, kein antd-`Checkbox`.** Grund ist Punkt 3
   oben — und dazu, dass die Kachel als Ganzes klickbar ist (`.etikett { cursor: pointer }`, `:266`),
   das Kästchen also ohnehin nur Anzeige ist. Ein nacktes Kästchen mit `.lb-nichtDrucken` ist
   ehrlicher als ein antd-Baustein, den eine Druckregel wieder verstecken muss. ⚠️ **Falls doch ein
   antd-`Checkbox` gewählt wird, gilt §8.4 unverändert weiter:** die Klasse sitzt dann auf dem
   Wrapper **innerhalb** des `<label className="lb-etikett">`, nie auf dem Label — auf dem Label
   druckte sie ein leeres Blatt. Das Druck-CSS greift in **keinem** der beiden Fälle auf `input` oder
   auf `.ant-*`.
2. **Der Bogen ist Papier und bleibt weiß**, auch im Dunkelmodus — `background: #ffffff` und
   `color: #000000` fest, im Druckblock **und** am Bildschirm (`.etikett { background: #fff }`,
   `:266`). Das ist die eine Stelle des Moduls, an der ein fester Farbwert richtig ist (§6.6.7): die
   Vorlage ist ein weißes Etikettenblatt, und ein dunkler Bogen wäre eine Vorschau auf etwas, das der
   Drucker nicht ausgibt.
3. **Die Maße bleiben in Millimetern** (48,5 × 25,4 mm, QR 20 × 20 mm, `@page { margin: 8mm }`) —
   sie sind an ein physisches Bogenformat gebunden und liegen als Werte in `_lib/etikettMasse.ts`
   (§8.4). Die Druckgeometrie im Einzelnen gehört §8.4; dieses Kapitel legt nur fest, dass sie über
   **Klassen**selektoren läuft und nicht über globale Element- oder `body *`-Regeln.
4. **Kein `@media print` außerhalb dieser einen Datei.** Ein Quelltext-Scan über **alle**
   `.css`-Dateien unter `m/lagerbuch/**` hält fest, dass `@media print` genau einmal vorkommt —
   in `(druck)/druck.css` — und `body *` gar nicht. ⚠️ Der Glob muss `(druck)/druck.css`
   **einschließen**: ein Scan über `_ui/*.module.css` ließe ausgerechnet die Datei aus, die die
   Druckregeln trägt, und wäre grün und blind. §8.5 führt denselben Scan als
   `etiketten/druck.test.ts`; es bleibt bei **einem**.

⚠️ **Kein Gate rendert Druck.** `pnpm build` und Vitest sehen `@media print` nicht, Playwright
rendert per Vorgabe für den Bildschirm, und der einzige heutige Test (`e2e/etiketten.spec.ts:11`)
prüft `.etikett img` im **Bildschirm**-DOM. Die Zusicherung, die dieses Kapitel dafür schuldet, ist
ein Playwright-Lauf mit `page.emulateMedia({ media: "print" })` auf `/verwaltung/etiketten`, der drei
Dinge prüft: die abgewählte Kachel ist unsichtbar, das Auswahlkästchen ist unsichtbar, und die
Suite-Kopfzeile ist es auch. **Dazu der Riegel aus §6.1.3** — ein Abruf ohne Lagerbuch-Gruppe muss
dieselbe Antwort liefern wie auf jeder Arbeitsseite.

---

### 6.11 Die 28 klassengebundenen Selektoren — was an ihre Stelle tritt

Die **Regel** steht in §12.3: Rollen und Beschriftungen statt Klassen; antds interne Klassen
(`.ant-drawer-body`) sind **kein** Ersatz, sondern eine schlechtere Kopplung — die Suite geht sie an
**genau einer** Stelle bewusst ein, mit ausgeschriebener Begründung
(`iuk-suite/src/app/globals.css`, `:root .ant-select-selector`, „der Bruch wäre still"), und es
bleibt bei einer. **Dieses Kapitel liefert die Gegenstücke**, weil nur es weiß, was an der Stelle
künftig steht.

Nachgezählt und einzeln nachgeprüft (28 Verwendungen an eigenen Klassen, dazu drei
Attributselektoren mit derselben Kopplung):

| Alter Selektor | × | Wo | Was er greift | Neuer Anker |
|---|---|---|---|---|
| `.drawer` | 8 | `loeschen.spec.ts:21,33,43,63` · `verwaltung-flow.spec.ts:26,40,55,61` | den Artikel-Drawer als Gültigkeitsbereich | `getByRole("dialog", { name: "<Artikelname>" })` — `Drawer` bekommt einen `title`, und der `title` **ist** der Name (heute `.sheettitle`, §6.8.3) |
| `tr.click` | 5 | `loeschen.spec.ts:32,42,62,73` · `verwaltung-flow.spec.ts:39` | eine anklickbare Tabellenzeile | `getByRole("row", { name: /…/ })` **und** darin `getByRole("link"\|"button", { name })` — der Anker ist der echte Link aus §6.4.1, nicht die Zeilen-`onClick` |
| `.card.journal .row` | 3 | `loeschen.spec.ts:37` · `verwaltung-flow.spec.ts:51,57` | eine Journalzeile | `getByRole("row")` in der Journaltabelle, adressiert über Zeitstempel + Artikelname |
| `.row` | 3 | `verfall.spec.ts:15,24` · `helfer-flow.spec.ts:44` | eine Listenzeile | `getByRole("listitem")` in der Verfallsliste (sie bleibt eine Liste, §6.4.2) |
| `.modalbox` | 2 | `loeschen.spec.ts:46,66` | den Löschdialog | `getByRole("dialog", { name: /löschen/i })` |
| `div.grid2 input.input` | 2 | `loeschen.spec.ts:24` · `verwaltung-flow.spec.ts:32` | ein Feld im Anlege-Raster | `getByLabel("<Feldname>")` — `Form.Item label` erzeugt die Verknüpfung |
| `table.tbl tbody tr` | 2 | `helfer-flow.spec.ts:26` · `verwaltung-flow.spec.ts:65` | Zeilen einer Tabelle | `getByRole("row")` unterhalb von `getByRole("table", { name })` |
| `a.row` | 1 | `helfer-flow.spec.ts:12` | eine verlinkte Listenzeile | `getByRole("link", { name })` |
| `.jdelta.minus` | 1 | `verwaltung-flow.spec.ts:67` | dass eine Entnahme als **negativ** dargestellt wird | ⚠️ **die Aussage bleibt, der Träger wechselt**: `getByRole("row", …).getByText("−1")` — geprüft wird das **Vorzeichen im Text**, nicht die Farbe (§12.2, Punkt 4). Für `.jdelta.minus` gibt es unter `src/` **kein** Netz; die Zusicherung ist die einzige, die es gibt |
| `.etikett img` | 1 | `etiketten.spec.ts:11` | dass die QR-Daten im Bogen landen | ⚠️ **Der QR ist ab dem Port ein Inline-SVG, kein `<img>`** (§8.4, §6.10.1) — ein `alt` gibt es dort nicht. Der Anker ist deshalb `getByRole("img", { name: /Zugangs-Code …/ })` auf dem **Umschlag** des SVG: `<span role="img" aria-label="Zugangs-Code 111-111">`. Wer stattdessen `alt` setzt, setzt es an ein Element, das es nicht gibt |
| `input[type="month"]` | 2 | `loeschen.spec.ts:35` · `verwaltung-flow.spec.ts:45` | das **native** Monatsfeld im Artikel-Drawer | `getByLabel("Verfallsmonat")`. ⚠️ **Beide Fundstellen greifen `ArtikelDrawer.tsx:307`, also ein Verwaltungsfeld** — nachgeprüft am Bestand. §7.7.2 Punkt 4 und §12.3 halten den Selektor für überlebensfähig, weil §7 das Feld des **Fahrzeug-Checks** nativ lässt (`CheckFlow.tsx:280`); das rettet diese zwei Zusicherungen **nicht**. **Entschieden für alle drei Verwaltungsfelder** (`ArtikelDrawer.tsx:307`, `KontrolleForm.tsx:71`, `VerfallEditor.tsx:58`): `DatePicker picker="month"` mit `format="YYYY-MM"`, der Wert wird an der Grenze auf die Zeichenkette `YYYY-MM` normalisiert (dayjs bleibt **in** der Insel), und die Strenge ist serverseitig `MONAT_REGEX` (§4.6) — ein `DatePicker` rendert **kein** `<input type="month">`, deshalb stirbt der Selektor hier und lebt nur auf dem Helfer-Ast weiter |
| `[title="111-111"]` | 1 | `helfer-flow.spec.ts:28` | einen Zugangs-Code über sein `title` | `getByRole("row", { name: /111-111/ })` |

**Vier Regeln über der Tabelle**, damit die Ersetzung nicht in eine grüne Lüge kippt:

1. **Jede Rollen-Zusicherung wird einmal gegen das gerenderte Bauteil geprüft**, nicht gegen die
   Absicht (§12.3, Regel 2). Der belegte Fall ist `role=searchbox` (§6.9.2), aber er ist nicht der
   einzige: ob ein `Drawer` eine `dialog`-Rolle mit zugänglichem Namen trägt, ob eine `Table` eine
   `table`-Rolle hat, ob `Form.Item label` tatsächlich verknüpft — das steht in keiner Spec, sondern
   nur im DOM.
2. **Ein neu geschriebener Nachfolgetest, der grün läuft und etwas anderes prüft als vorher, ist
   schlimmer als ein roter** (§12.3, Regel 3). Jede der zwölf Zeilen oben wird beim Umschreiben
   namentlich gegen ihre alte Fassung gehalten.
3. **Kein `.first()`.** Playwright fährt alle Dateien in **einem** Worker gegen **eine**
   SQLite-Datei; `.first()` hängt damit an der angesammelten Reihenfolge aller vorher gelaufenen
   Specs (§12.3, Regel 4). Betroffen ist unter anderem `etiketten.spec.ts:11` aus der Tabelle oben.
4. **Die Zugänglichkeit ist die Voraussetzung, nicht die Folge.** Alle Anker oben setzen voraus, dass
   die Oberfläche zugängliche Namen trägt: `Drawer title`, `Modal title`, `Form.Item label`,
   `role="img"` samt `aria-label` am QR-Umschlag, `aria-label` an den Icon-Knöpfen (§6.5.2). **Wer die
   Selektoren umschreibt, ohne diese Namen zu setzen, landet wieder bei Klassen** — und das ist der
   Weg, auf dem `.ant-drawer-body` in eine Spec kommt.

---

### 6.12 Die Prüffragen aus `docs/design/README.md:236-249`, auf diese Fläche angewandt

Die Fragen stammen aus der Fehleranalyse des `feedback`-Ports — „das Modul war nicht schlecht
gestaltet, es war **unfertig**: sechs von acht Server-Actions und drei Seiten hatten keinen
Einstiegspunkt." Sie werden hier nicht referiert, sondern beantwortet.

**1 — Hat jede Action einen Weg in der Oberfläche?** Bei 15 Navigationszielen und 24 Seiten ist der
Verlust eines Eintrags leicht zu übersehen; genau deshalb bleiben alle 15 (§6.3.1). Die
Gegenprobe gehört in die Bau-Task: **jede Server Action des Moduls wird namentlich einer Seite und
einem Bedienelement zugeordnet**, und die Liste wird abgehakt, nicht behauptet. Zwei Kandidaten für
das Vergessen sind benannt: die vier `*AktivToggle` (je eine Zeile in einem Detailblatt) und
`deaktiviereElement` als **zweiter** Ausgang des Löschdialogs (§6.4.5) — ein Dialog mit nur einem
Knopf lässt eine Action stumm zurück.

**2 — Führt kein Weg dorthin, wo die aufrufende Person nicht hindarf?** Auf dieser Fläche trivial: es
gibt genau eine Sichtbarkeitsstufe. Die eine Stelle, an der es nicht trivial war, ist §6.1.3 — und
sie ist geschlossen. Und `/verwaltung/kein-zugriff` gibt es nach dem Port nicht mehr (§11.4), also
auch keinen Weg dorthin (§6.2.2).

**3 — Ist der Zustand ablesbar, ohne zu klicken? Und der nächste Schritt benannt?** Ja, und das ist
die Stärke des Bestands, die nicht verloren gehen darf: jede Liste zeigt Status, Menge und Datum in
der Zeile (§6.9.4), die Übersicht zeigt fünf Kennzahlen mit dem nächsten Schritt im Text
(„abgelaufen — aussondern nötig", `page.tsx:48`). ⚠️ **Zwei Zustände sind heute nicht ablesbar und
werden es:** ob eine der beiden Obergrenzen gerade zugeschlagen hat (§6.9.3) und ob eine Datumsgrenze
aus der Adresszeile verworfen wurde (§6.9.2, Punkt 5).

**4 — Führt jede Seite zurück?** Ja: die Modulnavigation trägt alle 15 Abschnitte, und die neun
Detailseiten tragen zusätzlich eine Brotkrume (§6.3.3) — die dort nicht Zierde ist, sondern den
Verlust der Aktivmarkierung auffängt.

**5 — Kommen Fehler aus Server-Actions am Feld an?** Ja — §11.2 (d) und §6.4.7. ⚠️ Der Bestand hat
**22 ungefangene** Action-Aufrufstellen in elf Dateien, davon **19 in der Verwaltung**
(`SollEditor.tsx:29,62,66,67` · `TemplateVerknuepfung.tsx:38,42,76,83` ·
`TemplateAktionen.tsx:20,27,32,34` · `TemplatePosEditor.tsx:28,49,50` · die vier `*AktivToggle.tsx`
je `:11` · `MessungForm.tsx:13` · `NeuTemplate.tsx:14`). Sie liegen alle in Bausteinen, die dieses
Kapitel anfasst — der Umbau ist also der Anlass, sie zu schließen, und nicht ein Nachtrag danach.
Und die zwölf **gefangenen** Stellen werden ebenfalls umgestellt: `e.message` ist in Produktion der
englische Satz (Falle 66, §11.7).

**6 — Gibt es Leerzustände?** `globals.css:103` (`.empty`) trägt sie heute, und
`journal/page.tsx:36` schreibt „Keine Buchung gefunden." — künftig **mit dem gesetzten Filter im
Text** (§5.18), weil „keine Treffer" und „keine Daten" verschiedene Aussagen sind. In antd ist das
`Empty` mit eigener `description`. Betroffen sind alle 15 Listen aus §6.4.1 plus die Verfallsliste.

**7 — Zeigt die Liste, was sie zeigen soll, oder nur einen Link?** Ja — und die Regel dazu steht in
§6.4.1, Punkt 4 und §6.9.4: die Spalten bleiben, wie sie sind. Der Umbau auf `Table` ist ein
Trägerwechsel, keine Gelegenheit zum Aufräumen von Spalten.

---

### 6.13 Verworfene Alternativen

**Lesehinweis:** dies sind die Verwerfungen **dieses** Kapitels (Entscheidungen 29, 30, 31, 32, 34
sowie die Bausteinfragen). Verwerfungen anderer Kapitel stehen dort (§13).

| Verworfen | Warum |
|---|---|
| **E29 (b)** — eine `_ui/Icon.tsx`-**Client-Insel**, die Server Components mit `<Icon name="…"/>` bedienen | Macht jede Icon-Stelle zu einer Client-Grenze und lädt zum Fehlgriff ein: exportiert die Datei neben der Komponente eine **Map**, ist der Import aus einer Server Component Falle 6 — HTTP 200 mit leerer Map und still falschem Icon. Inline-SVG ohne `"use client"` (§6.5.2) hat dieselbe Ergonomie ohne die Grenze |
| **E29 (c)** — Tiefen-Import `@ant-design/icons/es/…` | Gemessen HTTP 200 (`core/shell/icons.ts:93-100`), aber `iuk-suite/CLAUDE.md` nennt es ausdrücklich „kein Vertrag, auf den man bauen sollte". Ein Paket-Update kann `exports` ändern, und der Ausfall wäre HTTP 500 auf 15 Routen |
| **E29 (d)** — `lucide-react` als Modul-Abhängigkeit behalten | Löste Falle 7 und die acht Fachzeichen auf einen Schlag, kehrt aber die Suite-Entscheidung vom 23.07. teilweise um und bringt ein Paket in den Baum, das die Suite heute nicht führt — für 36 Pfadangaben. Und es hinterließe zwei Zeichenquellen im Modul, weil der Helfer-Weg (§7.7.4) ohnehin Inline-SVG bekommt |
| **E30 (b)** — die heutigen drei Ampelwerte unverändert übernehmen | Die Luminanz bliebe nicht monoton (0,145 / 0,198 / 0,123), der von der Spec verlangte Test wäre von Anfang an rot, und der AA-Verstoß bei `chip-gelb` (3,78 : 1) wanderte mit |
| **E30 (d)** — nur die hellen Chip-Hintergründe neu ordnen, Textfarben lassen | Berührt die **Plakette** nicht, und die ist genau der Fall, der keinen Text mitführt (§6.4.8). Löst also die Hälfte des Problems und lässt die schwierigere Hälfte stehen |
| **E31 (b)** — sechs bis acht Ziele in der Leiste, der Rest in ein Überlaufmenü | Größere `core`-Änderung als die Überlaufreparatur (`SuiteNavItem` kennt weder Gruppen noch Kinder), und die Aufteilung „welche sieben sind wichtig" ist eine fachliche Behauptung ohne Beleg |
| **E31 (c)** — Gruppierung nach Fachbereich | Braucht eine dritte Navigationsebene, die es nicht gibt, und kostet auf jedem Weg einen Klick |
| **Einen `/`-Eintrag in `LAGERBUCH_NAV` deklarieren**, damit der Wurzel-Rückfall die neun Detailseiten markiert | Der äußere Modulwurzelpfad ist **das Gate**, nicht die Verwaltung. Der Eintrag wäre auf neun Detailseiten hervorgehoben, während man auf einem Geräteblatt steht — eine falsche Markierung ist schlechter als keine (§6.3.3) |
| **`aktiverEintrag` in `core` um einen Abschnittstreffer erweitern** | `core`-Änderung mit Wirkung auf vier laufende Module für einen Kosmetikgewinn in einem; die Funktion ist bewusst schmal (`SuiteNav.tsx:97-99`). Bleibt als eigene Suite-Entscheidung möglich |
| **E32 (a)** — auf Geist vereinheitlichen, **auch** im Helfer-Weg | Die Wortmarke „LAGERBUCH" ist Barlow Condensed und das Erste, was jede Helferin an jedem Einstiegspunkt sieht; die öffentliche Ansichtsklasse darf eigenständig aussehen (`docs/design/README.md:17-19`) |
| **E32 (c)** — alle drei Schriften modul-lokal registrieren, auch in der Verwaltung | Machte lagerbuch auf jeder Admin-Seite sichtbar zum Fremdkörper in der Suite, ohne dass die Wortmarke dort überhaupt noch stünde |
| **E34 (a)** — alle acht Neutralen auf antd-Tokens | Eigenes Markup (Chip, KPI-Kante, Plakette, Etikett) sieht `--ant-*` **nicht** (Falle 2), der Fehler ist still. Für eigenes Markup braucht es Modulvariablen — die Frage ist nur, wo die Grenze liegt |
| **E34 (b)** — alle acht als `--lb-*`-Modulvariablen | Zwei Neutralpaletten nebeneinander: eine `Card` in antd-Grau neben einem eigenen Kasten in `--lb-karte`, im Dunkelmodus verschieden. Die Grenze aus §6.6.6 ist billiger als die Verdopplung |
| **E35 (b)** — antd-`Table`-Pagination über die gedeckelten 100 | Seitenumbruch über einem Ausschnitt: der Pager sagt „10 von 100", während dahinter fünftausend Zeilen liegen. Ausdrücklich ausgeschlossen — und es ist die Variante, die ein `<Table dataSource={journal} />` **von selbst** erzeugt (§6.9.3) |
| **Infinite Scroll im Journal** | Setzt einen stabilen Cursor voraus; ohne `desc(buchungen.id)` als Tiebreaker erschienen an Nachladegrenzen Zeilen doppelt oder fielen aus. §5.14.4 setzt den Tiebreaker, damit **wäre** es baubar — für den Cutover ist es Aufwand ohne belegten Bedarf |
| **`Tag color="error"` für die Statuschips** | Greift auf `colorError` zu, also auf Suite-Rot, also auf Falle 3 — und es sieht nicht kaputt aus, nur falsch (§6.6.3) |
| **`Statistic` mit farbigem `valueStyle` für die KPI-Kacheln** | Eine rote Zahl **ist** Rot auf einer Datenfläche; die Kante trägt die Farbe, die Zahl trägt Tinte (§6.6.4) |
| **`RangePicker` statt zweier `DatePicker`** | Kein Tausch, sondern eine Bedeutungsänderung: aus zwei unabhängigen URL-Parametern würde ein Wertepaar, und „nur ab dem 1.3." wäre nicht mehr ausdrückbar (§6.9.2) |
| **`Popconfirm` statt des Löschdialogs** | Verlöre die serverseitige Vorprüfung, die Namenseingabe und den zweiten Ausgang „Deaktivieren" — drei Zusagen für eine Zeile Ersparnis (§6.4.5) |
| **`Form.Item`-gebundene Felder für die auto-committenden Editoren** | Dritte Zustandsquelle neben Serverwert und lokalem Spiegel, in Feldern, deren falscher Wert eine falsche Bestandszahl ist (Falle 45, §6.4.7) |
| **Antds interne Klassen als E2E-Anker** (`.ant-drawer-body`) | Tauscht eine Kopplung gegen eine schlechtere; antds Klassennamen sind kein Vertrag (§6.11, §12.3) |
| **`body * { visibility: hidden }` für den Druck mitnehmen** | Per CSS-Modul nicht kapselbar (CSS Modules schreiben nur Klassenselektoren um) und leerte **jede** Druckseite der Suite (§6.10.2) |
| **Das `files`-Druckmuster (`position: fixed; overflow: hidden`) für den Etikettenbogen** | `files` druckt eine Karte, der Bogen ist mehrseitig (~40 Etiketten je A4) — `overflow: hidden` schnitte alles ab Seite zwei ab, still und auf gekauftem Material (§8.4, §6.10.2) |
| **Eine eigene Druckansicht für Journal, Check-Bericht oder Bestellvorschlag** | Eine Druckansicht, die niemand druckt, ist Modul-CSS, das niemand prüft — und die Ausgabewege existieren bereits (§9) |

---

### 6.14 Was dieses Kapitel abgibt

| An wen | Was |
|---|---|
| **§2 (Modulgerüst)** | Der Registry-Icon-Name muss ein **Schlüssel** von `core/shell/icons.ts:132-139` sein, nicht bloß ein existierender antd-Name (§6.5.1) — die `core`-Ergänzung führt §2.2, Punkt 5 |
| **§8 (Etiketten)** | Die Auswahl ist ein eigenes Kontrollkästchen, kein antd-`Checkbox` (§6.10.2, Punkt 1); der QR-Umschlag trägt `role="img"` + `aria-label`, weil der Code ein Inline-SVG ist (§6.11). Umgekehrt gilt §8.4 für alles andere am Druckstück |
| **§11 (Fehlerzustände)** | Kein `Alert type="error"` im ganzen Modul; Warnungen sind `type="warning"` oder Text plus 3px linke Kante; die Kante trägt **Ampel**-Rot, nicht Suite-Rot (§6.6.5) |
| **§12 (Testaufbau)** | Sieben neue Zusicherungen: `aria-current` auf vier Fällen (§6.3.4) · `scrollWidth` bei 1280px (§6.3.2) · `_lib/ampel.test.ts` mit Monotonie, Kontrast, „nicht Suite-Rot" **und dem Abgleich TS ↔ CSS-Variablen** (§6.6.2a) · `_ui/ikonen.test.ts` mit drei Scans gegen die `IkonName`-Union (§6.5.5) · der `@media print`-Scan über **alle** `.css` des Moduls (§6.10.2) · der Druck-Riegel ohne Gruppe (§6.1.3) · je ein Abruf pro Modus auf drei Seiten (§6.6.7). ⚠️ Dazu die Korrektur an §12.3: der Selektor `input[type="month"]` überlebt **nicht** (§6.11) |
| **Das Runbook** | Zwei Zeilen: „Verwaltungsoberfläche im Dunkelmodus einmal durchgesehen (drei Seiten)" und „Etikettenbogen einmal auf echtem Papier gedruckt und gegen einen alten Ausdruck gehalten" — Papiermaße prüft kein Test (§8.4, R30) |
| **Die Bau-Task** | Die Zuordnung **jede Server Action → Seite → Bedienelement**, abgehakt statt behauptet (§6.12, Frage 1) |

**Und die eine Zeile, die dieses Kapitel dem Betreiber schuldet:** die Ampelfarben ändern sich
sichtbar (Gelb dunkler, Rot ein anderer Ton, §6.6.2). Die Helfer und Verwaltenden kennen die heutigen
Farben vom Etikett und aus dem Fahrzeug. Das ist keine Rückfrage — die Begründung (Luminanz-Monotonie
und ein bestehender AA-Verstoß) trägt die Entscheidung —, aber es gehört in die Ankündigung des
Cutovers und nicht in die Überraschung danach.

---

### 6.15 Die Auflagen, die andere Kapitel an §6 stellen — und wo dieses Kapitel sie einlöst

Sie sind an ihren Orten begründet; hier stehen sie beisammen, damit ein späteres Kapitel sie nicht
übersieht und nicht neu verhandelt. Die dritte Spalte ist die Gegenprobe: sie nennt die Stelle
dieses Kapitels, die die Auflage **wirklich trägt** — und benennt die zwei, die es nicht tut.

| # | Auflage | Herkunft | Eingelöst in |
|---|---|---|---|
| 1 | **Kein Layout außer `verwaltung/(arbeit)/layout.tsx`** mountet `<Shell variant="full">` — nie das Modul-Layout, nie ein `verwaltung/layout.tsx`. Der Grund ist die Vorfahrschaft: ein Layout umschlösse den gesamten Helfer-Zweig und die Gruppe `(druck)` (96px-Überlauf, Falle 41). Die **eine** weitere Stelle, die die Shell mounten darf, ist die **Blattseite** `g/[code]/page.tsx`: sie liegt außerhalb jeder Route-Group, das Group-Layout erreicht sie nicht, und ihr einziger gerenderter Zustand ist admin-only. Beide gehen über `_ui/VerwaltungsRahmen.tsx` — „EINE Stelle, ZWEI Importeure" wie bei `files` (`m/files/_ui/VerwaltungsRahmen.tsx:12`) | §2.9, §7.1.1, §2.1 c, §8.1 8-C2 | **§6.1.2** — `(arbeit)/layout.tsx` rendert `_ui/VerwaltungsRahmen.tsx`, `(druck)/layout.tsx` rendert `_ui/DruckRahmen.tsx` ohne Shell. ⚠️ Den **zweiten** Importeur derselben Komponente stellt §6 nicht: `g/[code]/page.tsx` mountet sie selbst (§2.9), und §6 liefert dafür nur die Komponente |
| 2 | Es darf **kein** `verwaltung/(arbeit)/etiketten/` geben — die Route liegt in `(druck)` und der Pfad kollidierte | §2.1 e, §8.4 | **§6.2.2, Zeile 24** — die Etikettenzeile ist als einzige `(druck)` ausgewiesen |
| 3 | Beide Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin`; jede Seite mit URL-abgeleiteter Kennung prüft die Zugehörigkeit **zusätzlich** selbst (Zwei-Linien-Regel) | §2.6, §3.2.1 | **§6.1.3** — und dort ist es nicht Wiederholung, sondern der einzige Punkt des Kapitels, an dem eine Auslassung nicht kosmetisch wäre |
| 4 | Navigation und Riegel lesen **dasselbe Prädikat auf demselben Viewer** — `istLagerbuchAdmin` auf dem Rückgabewert von `requireLagerbuchAdmin`, nie `canAdminModule`, nie ein zweiter `auth()`-Aufruf | §3.6.3 | **§6.1.1, Punkt 2** und **§6.1.3, Punkt 1** — ein Prädikat, zwei Aufrufer |
| 5 | `href` in `_lib/nav.ts` trägt die **äußere** Pfadform; jedes `revalidatePath` die **innere** | §2.1 g, §7.9.5 | **§6.3.1** (die 15 `href`) und **§6.3.3** (warum innere `href` die Markierung auf dem Normalweg zerstörten). ⚠️ Die `revalidatePath`-**Listen** der Verwaltungs-Actions löst dieses Kapitel **nicht** ein — §15.3, Nr. 23 |
| 6 | `usePathname` kommt unter `src/app/m/lagerbuch/` **nicht** vor — die Aktivmarkierung kommt als Server-Prop | §7.8.2 | **§6.3.4** — mit der einen namentlich benannten Ausnahme `useUrlFilter` (§5.14.1) |
| 7 | Die sechs listenspezifischen Suchfeldmengen werden einzeln portiert; ein globales `Table`-Suchfeld ersetzt sie nicht | §5.13.3 | **§6.9.4** — die sechs Feldmengen stehen dort einzeln, mit Filtern und Vorgabesortierung |
| 8 | Die Trefferanzeige „X von Y" bleibt als eigene Komponente und erscheint nur bei `gezeigt !== gesamt` | §5.13.3 | **§6.9.5, erstens** — samt der Begründung, warum ein antd-Pager **nicht dieselbe Aussage** ist |
| 9 | Der Excel-Export liest **dieselbe abgeleitete Liste** wie die Tabelle; wandert Filtern in antds `Table`-Zustand, wandert der Export mit | §5.13.3, §9.4 | **§6.9.5, zweitens** — und §6.9.4 Punkt 1 stellt sicher, dass es nur **eine** abgeleitete Liste gibt |
| 10 | Jedes `Select showSearch` setzt `optionFilterProp`/`filterOption` ausdrücklich — der `keywords`-Ersatz für `Combobox.tsx:74` | §5.13.3 | **§6.4.3, Bedingung 1** — mit den fünf Aufrufstellen namentlich |
| 11 | Jedes `Table` setzt `pagination` ausdrücklich; **keine Pagination über die gedeckelten 100** | §5.13.3, §13 | **§6.4.1, Punkt 1** (die Regel) und **§6.9.3** (warum sie auf zwei Tabellen eine Datenaussage ist) |
| 12 | Die zwei Monatsfelder (`ArtikelDrawer.tsx:307`, `KontrolleForm.tsx:71`) bekommen antd-Ersatz mit **derselben** `MONAT_REGEX`-Strenge | §4.6 | **§6.11** (`DatePicker picker="month"`, `format="YYYY-MM"`) und **§6.2.2, Zeilen 2, 5 und 13**. ⚠️ Mit zwei Korrekturen: es sind **drei** Felder (dazu `VerfallEditor.tsx:58`), und der antd-Ersatz kostet den E2E-Selektor `input[type="month"]`, den §7.7.2 Punkt 4 und §12.3 für überlebensfähig hielten |
| 13 | Die Check-Detailseite schreibt aus, dass die Verfall-Ampel gegen **heute** gerechnet ist, nicht gegen den Check-Zeitpunkt | §5.6.3 | **§6.2.2, Zeile 9** |
| 14 | Ein `altFormat`-Check zeigt einen Hinweistext, keine leere Tabelle | §4.10, §11.5 | **§6.2.2, Zeile 9** — `Alert type="warning"`, nie `type="error"` (§6.6.5) |
| 15 | Die Herkunft einer O2-Messung (Check gegen manuell) ist in Verlauf und Übersicht sichtbar | §5.8.1 | **§6.2.2, Zeilen 14 und 15** |
| 16 | Das BZ-Logbuch zeigt je Zeile die Grenzen aus `ref_snapshot`, nicht die heutigen aus `bz_geraete` | §5.11 | **§6.2.2, Zeile 12** |
| 17 | Die Bestellliste zeigt „bestellt seit &lt;Datum&gt;" und den Hinweis „Ware offenbar eingetroffen" | §5.5 | **§6.2.2, Zeile 19** |
| 18 | Der Löschdialog nennt bei Ablehnung den Grund und bietet **Deaktivieren** an | §5.21, §11.5 | **§6.4.5** — Vorprüfung, Namenseingabe, zweiter Ausgang; `Popconfirm` ist dafür ausdrücklich verboten |
| 19 | Rot steht nie auf einer Datenfläche; kein `Alert type="error"` neben einer Ampel; `size` wird nicht gesetzt; Eingabefelder ≥ 16px | §5.17, §11.6 | **§6.6.5** (Rot auf Handlungen, nie auf Aussagen; `Alert type="error"` erscheint im ganzen Modul nirgends), **§6.6.3** (Chips statt `Tag`), **§6.7.3** (16px). ⚠️ **Eine benannte Ausnahme zu `size`:** Zeilenaktionen **innerhalb** einer Tabellenzeile tragen `size="small"` — die einzige, die die Suite kennt (`docs/design/README.md:61-62`, §6.4.1 Punkt 4) |
| 20 | Fehler aus Server Actions kommen als **Rückgabewert** am Feld an, nie über `e.message` | §11.2 | **§6.4.7** (wo `antd Form` hin darf) und **§6.12, Frage 5** — samt der 19 heute ungefangenen Aufrufstellen in der Verwaltung |
| 21 | `/g/<code>` mit unbekanntem Barcode antwortet **200** mit gestaltetem Zustand, nicht `notFound()` — im `_ui/VerwaltungsRahmen.tsx` (Shell + `nav`), in antd, mit dem gescannten Code, dem Knopf „Noch einmal scannen" und dem Weg in die Geräteliste, und **ohne** `@ant-design/icons` (Falle 7) | §8.1, §11.3, §2.9 | ⚠️ **Der Zustand selbst nicht hier.** `/g/<code>` ist eine Rollen-Weiche außerhalb beider Group-Layouts (§2.1 c) und mountet den Rahmen **selbst**; die Auflage bleibt bei §8.1 (8-C2) und §11.3. §6 stellt die Bausteine — und mit `_ui/VerwaltungsRahmen.tsx` (§6.1.2) inzwischen auch den **Rahmen**, den die Seite mountet, dazu Ikonen (§6.5) und Chip (§6.6.3) |
| 22 | Es gibt **keine** Seite `/verwaltung/kein-zugriff` und **keine** Seite `/verwaltung/identitaeten` | §3.3, §4.13 | **§6.2.2, Schlussabsatz** — die Seite wandert nicht mit (§11.4), also gibt es weder Navigationseintrag noch Knopf |

---

## 7. Der Helfer-Weg — Scannen, Buchen, Fahrzeug-Check

Dieses Kapitel legt die Fläche fest, die **mobil am Lagerregal und in der Fahrzeughalle** benutzt
wird: das Gate, die Helfer-Sitzung, die Entnahme aus dem Handlager, den Fahrzeug-Check und die beiden
gescannten Einstiege `/t/<code>` und `/a/<artikelId>`. Es ist der eigentliche Zweck der Anwendung —
alles andere ist Vorbereitung darauf oder Auswertung davon.

**Was dieses Kapitel NICHT festlegt:** die Verwaltungsoberfläche (§6), das Datenmodell (§4), die
Sitzungsmechanik und die Riegel (§3), den Etikettendruck (§8), den Registry-Eintrag und die Migration
(§2). Wo dieses Kapitel darauf angewiesen ist, steht die Schnittstelle ausdrücklich benannt in §7.13.

---

### 7.1 Gestaltungsklasse — `/helfer/*`, `/a/*` und das Gate sind eine öffentliche Ansicht (Entscheidung 28)

**Entschieden: Option (d) der Analyse — öffentliche Ansichtsklasse, kein antd, eigenes CSS-Modul,
eigene Anmutung.** Der gesamte Helfer-Weg wird ohne `antd` und ohne Suite-Shell gebaut.

Die Analyse stellt vier Optionen ohne Empfehlung nebeneinander; die Entscheidung fällt aus fünf
Gründen, von denen vier belegt sind:

1. **`full` und `minimal` machen die Vollbild-App unbedienbar.** `.app` ist
   `height:100vh; height:100dvh; overflow:hidden; display:flex; flex-direction:column`
   (`lagerbuch/src/app/globals.css:129`) mit fester Tab-Leiste unten (`:147-150`,
   `HelferFrame.tsx:11-29`). `FullShell` ist `<Layout style={{minHeight:"100vh"}}>` + `<SuiteHeader>`
   + `<Content style={{padding: SPACE.lg}}>` (`core/shell/FullShell.tsx:20-22`), `headerHeight` fest
   64 (`core/theme/theme.ts:43`), `SPACE.lg` = 16 (`core/theme/tokens.ts:53`). Ein `100dvh`-Kind in
   diesem Content ergibt **64 + 32 = 96px Überlauf** — die Tab-Leiste wandert unter den
   Bildschirmrand, und damit ist die Umschaltung zwischen Entnahme und Fahrzeug-Check auf einem Handy
   nicht mehr erreichbar (Falle 41).
2. **`kiosk` ist für Wandmonitore gebaut, nicht für ein Handy in der Hand.**
   `core/theme/KioskThemeProvider.tsx:27,29` hebt `fontSize` auf 20 und `controlHeight` auf
   `TAP_XL` = 72 (`core/theme/tokens.ts`). Auf 390px Breite bleibt neben einem 72px-Bedienelement nichts übrig.
3. **Die Klasse ist in der Suite bereits definiert und passt.** `docs/design/README.md:15-19`:
   „Öffentliche Ansichten (kein Login, per Link/QR erreichbar, oft auf einem fremden Handy): dürfen
   eigenständig aussehen, eigene CSS-Module, **kein antd**." Der Helfer-Weg ist per QR erreichbar,
   läuft ohne Konto und findet auf privaten Telefonen statt.
4. **Damit sind zwei der sieben Fallen strukturell ausgeschlossen, nicht umgangen.** Ohne antd gibt
   es auf diesem Ast keinen Compound-Zugriff in einer Server Component (Falle 1) und keinen
   `@ant-design/icons`-Import (Falle 7 — HTTP 500 **beim Import**, `typecheck` und `build` bleiben
   grün, `core/shell/icons.ts:35-43`). Der mobile Kernpfad ist damit nicht auf Disziplin angewiesen.
5. **Das Route-JS bleibt klein** — auf einem Telefon im Fahrzeug kein Komfort, sondern die Frage, ob
   die Seite lädt.

⚠️ **Die Unschärfe, ausgeschrieben:** die Klasse heißt „login-frei", der Helfer-Weg läuft über eine
Token-Sitzung. Tragend ist aber die Abwesenheit eines **Kontos** — keine Anmeldung, kein Name, keine
Gruppen, kein OIDC-Rundlauf. In diesem Sinn ist auch der Abendzettel nicht anonym gegenüber dem
Server (`feedback-<surveyId>`-Cookie, `m/feedback/actions.ts:610`). Die Einordnung trägt, **und die
Regel wird nicht heimlich gedehnt, sondern hier ausgeschrieben**, damit die nächste Ansicht dieser
Art dieselbe Frage nicht neu stellt.

#### 7.1.1 Wie der Ausstieg technisch aussieht — das Modul-Wurzel-Layout rendert KEINE Shell

Die Shell wird **nicht** von oben über jedes Modul gelegt: **jedes Modul ruft `Shell` in seinem
eigenen Layout selbst auf** (`m/qr/layout.tsx:22-24`), und `ShellVariant` kennt nur
`"full" | "minimal" | "kiosk"` (`core/registry.ts:7`) — kein `"keine"`. **Ein Modul steigt aus,
indem es `Shell` nicht aufruft**, und das ist zweimal Hausstil: `m/feedback/` und `m/files/` haben
**kein** Modul-Wurzel-Layout, sondern Layouts an den Route-Gruppen; die öffentlichen Ansichten liegen
dort unter einem Layout **ohne** Shell.

**Für `lagerbuch` gilt die eine benannte Ausnahme** (§2.1 f): es gibt ein
`src/app/m/lagerbuch/layout.tsx`, und es trägt **ausschließlich**

```ts
export const metadata: Metadata = { manifest: "/manifest.webmanifest" };
```

plus `{children}`. **Kein `<Shell>`, kein Riegel, kein Rahmen, kein `viewport`-Export.** Der
Manifest-Verweis muss dort stehen und darf nicht ins Root-Layout — sonst bewirbt **jeder** Suite-Host
eine Lagerbuch-PWA (Falle 56, §7.10.2). Ein `<Shell>` an dieser Stelle wäre die naheliegende
Übernahme aus `m/qr/layout.tsx` und würde die Entscheidung aus §7.1 still aufheben — mit einem
Fehlerbild (Tab-Leiste unter dem Bildschirmrand), das `pnpm build` nicht findet und ein
Playwright-Lauf bei 1280×720 ebenfalls nicht. **Das ist Auflage 1 an §6** (§6.15; eingelöst in
§6.1.2).

Der vollständige Verzeichnisbaum steht in §2.1. Der Registry-Eintrag behält `shell: "full"` — der
Wert ist der, den das **Verwaltungs**-Layout liest; er wirkt nicht von selbst.

**Die Vorbedingung für `100dvh` ist erfüllt und nachgeprüft:** `src/app/globals.css:14-17` setzt
`body { height: 100%; margin: 0 }` ohne Innenabstand, und `src/app/layout.tsx:79` rendert `<body>`
ohne Stil. Der Modulrahmen bekommt die volle Höhe.

**Weitere Folgen:**

- Das Modul deklariert **keinen** `SuiteNavItem` für `/helfer/*` (§2.10). Falle 42 — 15 Einträge in
  einer `flex`-Leiste ohne `flex-wrap` und ohne `overflow-x` — wird durch diese Entscheidung
  **nicht** entschärft; sie ist in §6.3.2 entschieden (Entscheidung 31: alle 15 Einträge bleiben,
  `.modulnav` bekommt `overflow-x`).
- Die Suite-404 (`src/app/not-found.tsx`) ist auf diesem Ast der falsche Ort: sie ersetzt alle
  Modul-Layouts, trägt Geist statt der Modulschrift und einen antd-`Button` (`:57`). Deshalb gilt
  hier durchgehend **Entscheidung 36 (a)**: gestaltete Zustände in der Seite, HTTP 200, kein
  `notFound()` auf einem Weg, den eine Person mit einem gedruckten Gegenstand in der Hand nimmt.
  Vorbild und Begründung im Haus: `m/files/(oeffentlich-inbox)/u/[token]/page.tsx:13-17`.
- Hell/Dunkel läuft auch hier über `<html data-theme>` (Cookie `iuk-theme`, serverseitig gelesen,
  `src/app/layout.tsx`), **nicht** über `prefers-color-scheme` — das bräche den Fall „System dunkel,
  Umschalter hell" (`docs/design/README.md`, Abschnitt „Hell- und Dunkelmodus").

---

### 7.2 Der Ablauf Ende zu Ende

#### 7.2.1 Drei Einstiege, zwei physische Gegenstände

| Einstieg | Gegenstand | Was er trägt | Beleg |
|---|---|---|---|
| `GET /t/<code>` | **Zugangs-Kärtchen**, laminiert | QR mit `<base>/t/<code>`, Code zusätzlich im Klartext | `lagerbuch/src/db/etiketten.ts:23` |
| `GET /a/<artikelId>` | **Regaletikett** am Fach | QR mit `<base>/a/<id>` | `lagerbuch/src/db/etiketten.ts:19` |
| Gate, Code eintippen | — | dieselben sechs Ziffern vom Kärtchen | `lagerbuch/src/components/Gate.tsx:40` |

**Beide QR werden mit der Systemkamera gescannt, nicht mit einer Kamera-Insel der Anwendung.** Das
ist die wichtigste Präzisierung dieses Kapitels und weicht von der naheliegenden Annahme ab: der
`@zxing`-Scanner (`lagerbuch/src/components/BarcodeScanner.tsx`) hat auf dem Helfer-Weg **null**
Aufrufer. Ein `grep` über `lagerbuch/src` findet ihn genau zweimal, beide in der Verwaltung:
`verwaltung/(admin)/geraete/scan/GeraetScanner.tsx:2,7` und `verwaltung/(admin)/bz/scan/GeraetScanner.tsx:2,7`.
Der Helfer-Weg kennt keinen Kamerazugriff — er kennt gedruckte QR und ein Zahlenfeld. Der Satz auf
der Helfer-Startseite sagt es: „Regaletikett scannen öffnet den Artikel direkt — oder hier suchen."
(`lagerbuch/src/app/helfer/page.tsx:12`). Der Scanner wird trotzdem in §7.6 vollständig festgelegt,
weil er der andere mobile Kernpfad ist und weil sein Eingabeformat ein Vertrag mit der Außenwelt ist.

#### 7.2.2 Der Weg, Schritt für Schritt

```
[Kärtchen] ──Systemkamera──► GET /t/<code>
      1 Host · 2 Sperrprüfung · 3 normalisieren · 4 redeemToken · 5 Cookie · 6 303 + relatives Location
      └─ zielTyp=artikel → /a/<zielId>   fahrzeug → /helfer/check?fz=<zielId>   sonst → /helfer

[Regaletikett] ──Systemkamera──► GET /a/<artikelId>
      └─ ohne Sitzung → /?returnTo=/a/<id>  ──►  GATE (Modulwurzel /)
                                                  Code eintippen (Server Action, gleiches Rate-Limit)
                                                  ODER Pocket ID (Verwaltung)
                                                  └─► Cookie + redirect ans Ziel

/helfer  Artikelliste ─► /a/<id>  Bestand · Menge ±56px · [Entnahme buchen]
                                   └─► bucheEntnahmeHelfer ─► Rückmeldung (§7.3)

/helfer/check[?fz=<id>]  Fahrzeug wählen ─► Zählen ─► Nachfüllen ─► Geräte ─► Sauerstoff
                                   └─► checkAbschluss ─► Rückmeldung (§7.9.4)
```

**Die untere Tab-Leiste** hält die beiden Äste `/helfer` (Entnahme) und `/helfer/check`
(Fahrzeug-Check) dauerhaft erreichbar; sie ist bei `HelferFrame.tsx:25-28` schon so gebaut und bleibt
es (§7.8.2 legt fest, woher sie ihre Aktivmarkierung nimmt).

#### 7.2.3 `/t/<code>` — der Route Handler, und warum er kein `NextResponse.redirect` benutzt

Datei: `src/app/m/lagerbuch/t/[code]/route.ts`.

Heute baut der Handler Ziel und Cookie gegen `config.appBaseUrl`
(`lagerbuch/src/app/t/[code]/route.ts:19,30`) und setzt das Cookie auf **diese** Antwort (`:31`).
Weicht die Basis-URL vom anfragenden Host ab, ist der Redirect cross-origin: das Cookie gilt für den
einen Host, die Landung passiert auf dem anderen, die Helferin kommt ohne Sitzung am Gate an — und
der Code bleibt gültig, ist aber wegen `lastUsedAt` (`token-redeem.ts:16`) nicht mehr löschbar,
sondern nur noch sperrbar (`loeschen.ts:89-99`). Das ist Falle 16.

**Entschieden: der Handler kennt keine Basis-URL mehr.** Er antwortet mit **HTTP 303 und einem
relativen `Location`**:

```ts
// src/app/m/lagerbuch/t/[code]/route.ts
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const kopf = new Headers(req.headers);
  if (!lagerbuchHostOderNull(kopf)) return new Response("Not found", { status: 404 });  // §2.6

  const { code } = await ctx.params;
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const zumGate = (grund?: "zuviele" | "code") => {
    const ziel = new URLSearchParams();
    if (returnTo) ziel.set("returnTo", returnTo);
    if (grund) ziel.set("grund", grund);          // §3.9 — das Gate LIEST ihn
    return antwort(`/${ziel.size ? `?${ziel}` : ""}`);
  };

  const absender = absenderAus(kopf);                                    // §3.5.2, einmal ermittelt
  if (gateGesperrt(absender) !== null) return zumGate("zuviele");        // §3.5.3, Schritt 2, OHNE DB
  // Die Sekundenzahl wird NICHT mitgegeben: das Gate liest sie selbst aus derselben
  // Schranke, mit denselben Absender-Kopfzeilen (§7.2.4, §3.9).
  //
  // `redeemToken` NIMMT das Handle, es holt sich keins: `_db/client.ts#getDb()` ist der
  // einzige Opener des Moduls (§5.13.2), und ein Lese-/Schreibpfad, der ihn selbst ruefe,
  // waere der erste, der die Regel aufweicht. Eine Signatur, zwei Aufrufer — das Gate
  // (`_actions/gate.ts`) und `erneuereSitzung` rufen sie gleich (§7.5.2, §7.13.2).
  const res = await redeemToken(normalisiereCode(code), getDb());        // §7.5.3, §7.13.2
  if (!res.ok) { gateFehlversuchBuchen(absender); return zumGate("code"); }

  const antw = antwort(returnTo ?? tokenZielPfad(res.zielTyp, res.zielId));
  antw.cookies.set(HELFER_COOKIE, res.cookieValue, helferCookieOptionen(gueltigkeitSekunden()));
  return antw;
}

/**
 * 303 mit RELATIVEM Location. Bewusst NICHT `NextResponse.redirect(…)`: das
 * verlangt eine absolute URL, und jede absolute URL hier ist entweder aus einer
 * Basis-Variablen geraten (Falle 16) oder aus `req.url` gebaut — und `req.url`
 * traegt nach dem Rewrite den INNEREN Pfad
 * (`m/files/_lib/hostRolle.ts:137-139` schreibt das aus). Ein relatives Location
 * loest der Browser gegen die URL auf, die ER sah: den aeusseren Modul-Host
 * (RFC 7231 §7.1.2). Cookie und Landung koennen damit KONSTRUKTIV nicht
 * auseinanderfallen. Wer das „repariert", bricht den Mehrhost-Betrieb.
 *
 * 303 und nicht 302: die Antwort auf ein GET soll auch nach dem Folgen ein GET
 * sein, und 303 sagt das ausdruecklich, statt es dem Browser zu ueberlassen.
 *
 * RUECKFALL, falls der E2E (§7.12.4) das widerlegt: Herkunft aus
 * `x-forwarded-host` bauen (`core/routing.ts:17-23`). NIE aus der Konfiguration.
 */
function antwort(pfad: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: pfad } });
}
```

**`config.appBaseUrl` verschwindet damit aus dem gesamten Helfer-Weg.** Verblieben ist die Variable
nur noch dort, wo sie fachlich hingehört: in den gedruckten Pixeln des Etikettenbogens
(`etiketten.ts:15`) — und dort heißt sie in der Suite `SUITE_HOST_LAGERBUCH`, gelesen über
`moduleUrl("lagerbuch")` (§8.1).

**Drei stille Nebenwirkungen derselben Variablen fallen mit weg** (Falle 16): `Secure` der
Helfer-Sitzung (`helferSession.ts:32` → `NODE_ENV`, §3.4.2), der `__Secure-`-Präfix des
Callback-Cookies (`auth.config.ts:65,75` → entfällt mit der eigenen Auth-Konfiguration),
`AUTH_URL=${APP_BASE_URL}` (`compose.yaml:16` → `AUTH_URL` ist suiteweit derselbe Wert,
`core/auth/redirect.ts:8-11`).

#### 7.2.4 Das Gate — Modulwurzel, zwei Karten, ein gelesener Fehlerparameter

Datei: `src/app/m/lagerbuch/page.tsx` (Server Component) + `src/app/m/lagerbuch/_ui/Gate.tsx`
(`"use client"`, wegen `useActionState`).

Das Gate liegt auf der **Modulwurzel**, nicht unter `/gate` — 1:1-Pflicht, weil jedes `returnTo` und
jeder Rückfall der Cordon-Logik dorthin zeigt (`cordon.ts:17,65` — nachgezählt am eingefrorenen
`main` @ `ca04eb1`; die frühere Fassung zitierte `:18,64`, das sind die schließende Klammer bzw. die
`encodeURIComponent`-Zeile darüber). Es ist zugleich die einzige Datei, die auf `/m/lagerbuch`
auflöst (§2.1 b).

**Der Rumpf der Datei, vollständig und in bindender Reihenfolge.** Er ist zugleich die Aufrufstelle,
die `adminLandingPfad` bisher nicht hatte (§3.6.6) und der Leser der Sekundenzahl aus §3.5.3 — beide
Fragen werden hier und nur hier beantwortet:

```ts
// src/app/m/lagerbuch/page.tsx — DAS GATE. Die Reihenfolge ist bindend.
export const dynamic = "force-dynamic";

export default async function GatePage(
  { searchParams }: { searchParams: Promise<{ returnTo?: string; grund?: string }> },
) {
  const kopf = await headers();
  requireLagerbuchHost(kopf);                         // §2.6 — erste Anweisung
  const { returnTo, grund } = await searchParams;

  // PRAEDIKAT, KEIN RIEGEL (§3.2.1). `requireLagerbuchAdmin()` waere hier falsch:
  // es wuerfe jede Person OHNE Sitzung nach `/login` — also genau die Helferin,
  // fuer die diese Seite gebaut ist. Drei gueltige Faelle, nicht einer.
  if (istLagerbuchAdmin(await viewerOderNull())) redirect(adminLandingPfad(returnTo));

  // Die Sekundenzahl fuer `grund=zuviele` (§3.9) wird NICHT ueber die URL getragen:
  // diese Seite hat dieselben Absender-Kopfzeilen wie die eben abgewiesene Anfrage
  // und fragt die Schranke selbst. LIEST nur, bucht nichts, ohne Datenbankzugriff.
  const sperrSekunden = gateGesperrt(absenderAus(kopf));          // §3.5.3
  const meldung = gateMeldung(grund, sperrSekunden);              // §3.9 — die EINE Textquelle

  // Angemeldet, aber OHNE Lagerbuch-Gruppe: bleibt bewusst hier stehen und sieht
  // Zahlenfeld UND Verwaltungs-Knopf — der hingenommene Preis aus §11.7.
  return <Gate meldung={meldung} returnTo={sanitizeReturnTo(returnTo) ?? ""} … />;
}
```

⚠️ **Zwei Änderungen an `adminLandingPfad` gegenüber dem Bestand, beide bereits entschieden:** der
Zweig `ziel.startsWith("/verwaltung/kein-zugriff")` (`cordon.ts:41`) fällt mit der Seite weg (§3.3,
§11.4), und die Begründung der `/helfer`-Sperre in der Allowlist verweist im Bestand auf
`helferGateDecision` (`cordon.ts:33-35`) — die Funktion entfällt (§3.1). **Die Sache bleibt
dieselbe:** `helfer/layout.tsx` ruft `requireHelferSitzung`, das eine verwaltende Person ohne
Helfer-Sitzung sofort wieder aufs Gate schickt (§3.4.4) — mit `/helfer` als `returnTo` wäre das eine
Endlosschleife. `/a/<id>` bleibt in der Allowlist und bleibt schleifenfrei, weil die Weiche dort
Admins selbst in die Verwaltung leitet (`cordon.ts:44-46`, `a/[artikelId]/page.tsx:18`) — so
überlebt ein gescanntes Regaletikett den Umweg über Pocket ID.

**Zwei Karten, wie heute** (`Gate.tsx:34-68`):

- **„Im Dienst"** — Zahlenfeld + „Weiter". Server Action `einloesenAmGate` (`_actions/gate.ts`).
- **„Verwaltung"** — Anmeldung über Pocket ID, verdrahtet nach §3.6.6 (Entscheidung 15 a). Die Karte
  **bleibt** und ist ein zweites, gleichrangiges Ziel neben dem Zahlenfeld — der einzige sichtbare
  Verwaltungseinstieg auf dem lagerbuch-Host.

**Das Gate liest `?grund=`.** Heute schreibt `/t/<code>` `?err=rate`/`?err=code` an die Gate-URL
(`t/[code]/route.ts:21,25,27`) — und **niemand liest es**: `(gate)/page.tsx:10` destrukturiert nur
`returnTo`, `Gate.tsx:41` zeigt den Rückgabewert der Form-Action. Wer ein gesperrtes Kärtchen scannt,
landet wortlos auf dem Gate (Falle 60). **Der Parameter heißt ab jetzt `grund`, sein Wertesatz und
die vier Texte stehen in §3.9** — dort und nur dort. Der Text erscheint an derselben Stelle wie der
Rückgabewert der Server Action (`.gateFehler`, heute `gateerr`, `globals.css:126`), damit es genau
**einen** Fehlerort auf dem Gate gibt.

**Und es liest die Sekundenzahl selbst — sie steht nicht in der URL.** Die drei Zeilen dafür stehen
im Rumpf oben: `gateGesperrt(absenderAus(kopf))` liefert die Restsekunden oder `null` (§3.5.3),
`gateMeldung(grund, sperrSekunden)` macht daraus den einen Satz (§3.9). Drei Gründe, warum *n* nicht
über `?grund=zuviele&sek=42` mitwandert, und der dritte ist der tragende: eine Zahl in der URL ist
beim ersten Neuladen **gelogen**; ein `searchParams`-Wert ist Nutzereingabe und müsste ohnehin
verworfen und neu ermittelt werden (§3.9); und die Gate-Seite hat **dieselben Absender-Kopfzeilen**
wie die Anfrage, die eben abgewiesen wurde — sie fragt die Schranke also mit demselben Schlüssel und
bekommt dieselbe Antwort, ohne dass irgendetwas transportiert werden muss. ⚠️ Der Aufruf steht
**hinter** dem Host-Riegel der Seite und liest die Kopfzeilen über `await headers()`; `absenderAus`
nimmt die Header entgegen, statt sie selbst zu holen (§3.5.2), und bleibt damit auch aus dem Route
Handler heraus benutzbar.

**Das Zahlenfeld** (heute `Gate.tsx:40`, Klasse `.tokeninput`, `globals.css:125`) trägt in der Suite:

```html
<input class="codefeld" name="code" inputmode="numeric" autocomplete="off"
       maxlength="7" pattern="[0-9]{3}-?[0-9]{3}" placeholder="000-000"
       aria-label="Zugangs-Code" aria-describedby="codehinweis" />
```

`font: 700 24px/1 var(--lb-mono)` — deutlich über der 16px-Untergrenze (§7.7.2),
`letter-spacing:.16em` wie heute. `inputMode="numeric"` ist neu und ist zusammen mit `maxlength` und
`pattern` die billigste Maßnahme gegen Fehleingaben am gemeinsamen Rate-Limit-Eimer (§7.5.3).

#### 7.2.5 Das Landeziel eines Codes bleibt unverändert

`tokenZielPfad` (`lagerbuch/src/lib/auth/tokenZiel.ts:8-12`) wandert **zeichengleich** nach
`src/app/m/lagerbuch/_lib/tokenZiel.ts`:

| `zielTyp` | Ziel |
|---|---|
| `"artikel"` + `zielId` | `/a/<zielId>` |
| `"fahrzeug"` + `zielId` | `/helfer/check?fz=<zielId>` |
| sonst | `/helfer` |

**Das sind äußere Pfade und bleiben es** — sie landen im `Location`-Header bzw. in `redirect()` und
werden vom Browser gegen den äußeren Host aufgelöst. Die Gegenkonvention gilt nur für
`revalidatePath`, das den **inneren** Pfad braucht (Falle 49, §7.9.5). Beide Sorten stehen in
diesem Kapitel nebeneinander; die Verwechslung ist die eigentliche Falle (§2.1 g).

`sanitizeReturnTo` (`returnTo.ts:3-10`) wandert zeichengleich nach `_lib/returnTo.ts`, inklusive der
vier Ablehnungsgründe (`//`, `/\`, `:`, kein führender `/`) und des Tests — Open-Redirect-Schutz an
drei Stellen. Kein Suite-Gegenstück: `core/auth/redirect.ts#suiteRedirect` prüft eine **Host**-
Allowlist, nicht lokale Pfade.

---

### 7.3 Die Zustände dazwischen — auch die unschönen

Die Anwendung hat heute für einen Teil dieser Lagen keine Antwort, für einen anderen eine falsche.
Die vollständige Zustandstabelle über alle Kapitel steht in **§11.5**; hier steht das **Grundmuster**
und der Ergebnistyp, weil beide diesem Kapitel gehören.

**Das Grundmuster (Falle 66), verbindlich: jede erwartbare Fehlerlage wird als Rückgabewert
transportiert, nicht als Wurf.** Der Produktions-Deserialisierer hat für eine Fehlerzeile genau
einen Zweig (`resolveErrorProd`) und baut einen festen englischen Satz mit `digest`; `e.message`
erreicht in Produktion niemanden. Die 22 deutschen Texte in `lagerbuch/src/actions/*` sind fachlich
richtig und betrieblich wirkungslos. Vorbild: `m/files/(verwaltung)/actions.ts:60-61,310-311`.

**Der Wurf bleibt dem Riegelfall vorbehalten** — dort, wo kein Text nach außen soll und wo die Lage
nicht „erwartbar", sondern „manipuliert" heißt. In `checkAbschluss` sind das genau vier Stellen, und
sie bleiben Würfe: „Soll-Position gehört nicht zu diesem Fahrzeug" (`check.ts:94`), „Gerät gehört
nicht zu diesem Fahrzeug" (`:128`), „Flasche gehört nicht zu diesem Fahrzeug" (`:139`), „Artikel
gehört nicht zu diesem Fahrzeug" (`:155`). Kein Helfer erreicht sie über die Oberfläche.

Der Rückgabetyp, einmal für beide Helfer-Actions:

```ts
// src/app/m/lagerbuch/_lib/actionTypen.ts   (KEIN "use client" — Falle 6)
// Bewusst NICHT unter _actions/: der Guard-Scan aus §3.8.2 liest jede Datei dort
// und erwartet exportierte Actions; eine reine Typdatei braeuchte eine Ausnahme.
export type HelferGrund = "sitzung" | "gesperrt" | "leer" | "netz";

export type HelferErgebnis<T> =
  | { ok: true; wert: T }
  | { ok: false; grund: HelferGrund; text: string };
```

⚠️ **`"netz"` entsteht nie serverseitig** — es ist der Grund, den der Client im `catch` selbst setzt,
damit die Anzeigelogik genau eine Form kennt. Das steht als Kommentar an der Definition, sonst sucht
der nächste Leser die Erzeugerstelle im Server.

**Die vier Gründe und ihre Wirkung im Helfer-Zweig:**

| `grund` | Anlass | Anzeige | Inline-Erneuerung (§7.4.4)? |
|---|---|---|---|
| `sitzung` | Cookie fehlt, abgelaufen oder ungültig | „Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen." | **ja** |
| `gesperrt` | Cookie gültig, `tokens.aktiv = 0` | „Dieses Kärtchen wurde gesperrt. Die Buchung wurde **nicht** gespeichert." | **nein** — ein erneutes Einlösen desselben Codes scheitert genauso |
| `leer` | `fefoAbbuchung` gibt `gebucht: 0` | „Im Handlager liegt nichts mehr von **X**. Bitte der Verwaltung melden." | nein |
| `netz` | `catch` im Client | „Keine Verbindung. Die Buchung wurde **nicht** gespeichert." | nein |

**Zwei Zustände, die heute als Erfolg aussehen und es nicht sind** — sie sind der Kern der
Umstellung:

- **Handlager leer, Entnahme läuft ins Leere.** `fefoAbbuchung` wirft nie (`db/abbuchung.ts:24-54`);
  ist nichts mehr da, gibt die Action `{gebucht: 0}` zurück (`actions/buchung.ts:82-93`), und
  `HelferEntnahme.tsx:26-27` macht daraus „Entnahme gebucht: 0 × X" — **grün, mit Häkchen** (`:55`,
  `chip chip-ok`). → `gebucht === 0` wird ausdrücklich `{ok:false, grund:"leer"}`. **Ein 200, das
  lügt, ist der teuerste Zustand dieser Tabelle.**
- **Handlager reicht nur teilweise** (`0 < gebucht < menge`): heute ein grüner Chip mit der
  **kleineren** Zahl, ohne Hinweis. → `{ok:true}` mit `angefordert` — „**3 von 5** gebucht; mehr lag
  nicht im Handlager."

**Und zwei ungefangene Aufrufstellen, die dieses Kapitel schließt** (von 22 insgesamt, Falle 62):
`HelferEntnahme.tsx:22-30` hat **kein `catch`** — der Wurf schlägt bis zur Fehlerseite durch;
`CheckFlow.tsx:158-159` fängt zwar, zeigt aber `e.message`, was in Produktion der englische
Server-Components-Satz ist (Falle 66). Beide bekommen `try/catch` mit `grund: "netz"`, und im
Check-Fall lautet der Text „Keine Verbindung. Der Check wurde **nicht** gespeichert — nichts ist
verloren, bitte erneut auf Abschließen tippen." **Alle sechs Client-Zustände bleiben dabei stehen.**

---

### 7.4 Der Riegel — Sitzung, Sperrwirkung, und wo der Riegel steht

Die Sitzungsmechanik gehört §3; hier stehen die Teile, die den Helfer-Weg unmittelbar bestimmen.

#### 7.4.1 Die Sitzung, das Geheimnis und die eine Bedingung, unter der die Übernahme trägt

`createHelferSitzung` / `verifyHelferSitzung` (aus `lagerbuch/src/lib/auth/helferSession.ts:10-29`)
wandern nach `src/app/m/lagerbuch/_lib/helferSitzung.ts`: `HS256`, `setIssuedAt()`,
`setExpirationTime(\`${stunden}h\`)`, Cookie-Name **`helfer_session`**, **kein `domain`** (§3.4.2).

**Die Nutzlast wird auf `{ tokenId }` gekürzt, und die Verifikation bleibt nachsichtig** (§3.4.3):
sie verlangt nur `typeof tokenId === "string"` und ignoriert überzählige Felder. **Damit verifiziert
jedes Alt-Cookie mit `{tokenId, code, label}` unverändert weiter** — Geheimnis, Name und Signatur
sind dieselben. Genau das ist die Eigenschaft, die Betreiber-Entscheidung 4 braucht; eine strikte
Feldprüfung auf genau `{tokenId}` beendete jede laufende Feld-Sitzung beim Cutover, und **kein
anderer Test sähe das** (§3.8.1).

`code` und `label` kommen ab jetzt aus der DB-Zeile (§3.4.4). Die drei Aufrufer, die das merken —
`helfer/layout.tsx:10`, `a/[artikelId]/page.tsx:24` und der Schreibweg mit `quelle_id = code` — lesen
den Rückgabewert von `requireHelferSitzung`/`requireHelferSchreibend`.

⚠️ **Die Bedingung, unter der die Geheimnis-Übernahme überhaupt trägt, steht in keiner Analyse-Zeile
und gehört hierher: `helferCookieOptionen()` setzt `path:"/"` OHNE `domain` — das Cookie ist
host-only.** Es überlebt den Cutover also **nur, wenn der neue Modul-Host zeichengleich der heutige
ist.** Ist `SUITE_HOST_LAGERBUCH` ein anderer Host als die heutige `APP_BASE_URL`, ist die Übernahme
des Geheimnisses für Helfer-Sitzungen wirkungslos (für `AUTH_SECRET` gälte das nicht in gleicher
Weise: Auth.js-Cookies tragen `domain` aus `AUTH_COOKIE_DOMAIN`, `core/auth/cookies.ts:47`).
→ **Runbook-Eingabe:** die heutige `APP_BASE_URL` im Wortlaut, und die Bestätigung, dass
`SUITE_HOST_LAGERBUCH` derselbe Host ist. Weicht er ab, gehört in die Cutover-Kommunikation der Satz
„alle Helfer müssen ihr Kärtchen einmal neu scannen".

Der Env-Name ist **`LAGERBUCH_HELFER_SITZUNG_SECRET`** (§10.3), der **Wert** kommt 1:1 aus
`HELFER_SESSION_SECRET` der produktiven `stack.env`. Der Startriegel dagegen steht in §10.5; er prüft
insbesondere den **leeren String**, weil der den zod-Default nicht greift und der Container sonst
grün bootet und erst beim ersten Scan mit 500 umfällt (Falle 23).

**Nicht behoben, ausdrücklich benannt (Falle 20):** keine gleitende Verlängerung, kein `jti`, kein
Einzelwiderruf. Wer um 07:00 einlöst, fliegt um 19:00 heraus. Bleibt 1:1; die Abhilfe für den
einzigen schmerzhaften Fall (Ablauf mitten im Check) ist §7.4.4, nicht ein Umbau des
Sitzungsformats — und sie verlangt den Code erneut, ist also keine Verlängerung „auf Knopfdruck"
im Sinne von §3.4.3.

#### 7.4.2 Sperrwirkung gilt ab jetzt auch lesend (Entscheidung 13, Option b)

`requireHelferSitzung(db)` prüft bei **jedem** Helfer-Seitenaufruf zusätzlich `tokens.aktiv` in der
Datenbank, nicht mehr nur bei schreibenden Aktionen. Vollständig entschieden und begründet in §3.4.4.
Für den Helfer-Weg heißt das konkret: verschwindet ein laminiertes Etikett aus einem Fahrzeug, ist
der Lesezugriff nach dem Sperren **bei der nächsten Anfrage** weg statt nach bis zu 12 Stunden.

#### 7.4.3 Wo der Riegel steht — aufrufbare Funktionen, nicht ein Layout

Falle 17 trägt hier: **Route-Group-Grenzen sind keine Sicherheitsgrenzen** (§2.1 d). Die drei
Funktionen und ihre Verankerung stehen in §3.2.1; für dieses Kapitel gilt:

| Datei | Aufruf |
|---|---|
| `helfer/layout.tsx` | `requireLagerbuchHost(await headers())` + `requireHelferSitzung(getDb())` — **nur der Riegel**, kein Rahmen (§7.8.2). ⚠️ Die Datei ist eine **Server Component** und kann deshalb kein Cookie räumen (`next/…/request-cookies.js:53`); der Sperr- und der Ablauffall gehen darum über den Route Handler `/abmelden` (§3.4.4) |
| `helfer/page.tsx`, `helfer/check/page.tsx` | erben den **Riegel** vom Layout — rufen `requireHelferSitzung(getDb())` aber **selbst noch einmal**, weil ein Layout einer Seite keine Props reichen kann und `sitzungsetikett` und `laeuftAb` genau von dort kommen (§7.8.2). Der zweite Aufruf ist billig: dasselbe gecachte Handle (§5.13.2), derselbe Lookup über `tokens.id`. Danach `HelferRahmen` mit `aktiv`, `sitzungsetikett`, `laeuftAb` |
| `a/[artikelId]/page.tsx` | `requireLagerbuchHost` + eigene Rollen-Weiche mit `helferZugangOderNull(getDb())` — der Admin darf hier auch ohne Helfer-Sitzung hin (`cordon.ts:61`: `allowed = isA ? hasHelfer \|\| isAdmin : hasHelfer`). ⚠️ Der Admin-Zweig fragt `istLagerbuchAdmin(await viewerOderNull())`, **nicht** `requireLagerbuchAdmin()`: der dritte Fall dieser Datei ist „keine Sitzung → Gate mit `returnTo`" (`a/[artikelId]/page.tsx:19`), und ein Riegel schickte ihn nach `/login` (§3.2.1, §11.5 Zustand 18). ⚠️ Der Admin-Zweig **rendert nicht**, er leitet um (`a/[artikelId]/page.tsx:14-19`: `/verwaltung/artikel?a=…`, sonst Gate mit `returnTo`). Gerendert wird diese Seite **nur** mit einem `HelferZugang` — und nur deshalb dürfen `sitzungsetikett` und `laeuftAb` am `HelferRahmen` Pflicht-Props sein (§7.8.2) |
| `g/[code]/page.tsx` | dieselbe Bauform mit umgekehrtem Vorzeichen (§2.1 c): `requireLagerbuchHost`, dann `istLagerbuchAdmin(await viewerOderNull())` zuerst, dann `helferZugangOderNull(getDb())` → `/helfer`, sonst Gate mit `returnTo` (`g/[code]/page.tsx:21-25`). **Kein** `requireHelferSitzung` — `/g` hat keinen Zweig, der eine Helfer-Sitzung verlangt |
| `_actions/buchung.ts`, `_actions/check.ts` | `requireHelferSchreibend(getDb())` als **erste** Anweisung, vor jedem `parse` |

```ts
// _actions/buchung.ts — die erste Anweisung, mit ausgeschriebenem Kommentar
// ERSTE Anweisung, und der Rueckgabewert MUSS ausgewertet werden. Bis zur
// Portierung warf dieser Riegel (session.ts:25,28) — ein Wurf liess sich nicht
// uebersehen. Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` ohne
// Pruefung ist typkorrekt, lint-sauber und oeffnet diese Action fuer jeden. Das
// einzige Netz dagegen ist der E2E „gesperrter Token wird an der Buchung
// abgewiesen" (§3.8.3, §7.12.4).
const riegel = await requireHelferSchreibend(db);
if (!riegel.ok) return { ok: false, grund: riegel.grund, text: TEXTE[riegel.grund] };
```

**Der Riegel für Server Actions war nie der Cordon, und das muss beim Port stehen bleiben** (Falle
18, §3.2.1 Punkt 3): die tragende Zusage ist die Vollständigkeit der Guard-Liste — 44 von 44, plus
die drei benannten Ausnahmen (§3.8.2).

#### 7.4.4 Inline-Erneuerung — die einzige Antwort auf „Sitzung weg nach 15 Minuten Zählen"

Ein Fahrzeug-Check ist zehn bis zwanzig Minuten Arbeit, und der gesamte Zustand liegt im Client
(`CheckFlow.tsx:62-71`: sechs `useState`). Läuft die Sitzung ab oder wurde das Cookie geräumt
(§7.10.4), führt jeder naheliegende Weg — Redirect aufs Gate, Neuladen — durch das Verwerfen dieser
Arbeit.

**Entschieden:** Bei `grund === "sitzung"` zeigt der Abschluss-Bereich **an Ort und Stelle** ein
Zahlenfeld:

> Deine Sitzung ist abgelaufen. Kärtchen erneut eingeben — **die gezählten Mengen bleiben stehen.**
> [ 000-000 ] [Weiter]

Server Action `erneuereSitzung(code): Promise<HelferErgebnis<null>>` in
`src/app/m/lagerbuch/_actions/sitzung.ts`. Sie durchläuft **dasselbe** Rate-Limit (§3.5.3),
**dieselbe** Normalisierung (§7.5.3), **denselben** Host-Riegel und **dieselbe** Protokollzeile wie
das Gate — es ist eine dritte Gate-Fläche und wird als solche behandelt, nicht als Sonderweg. Sie
steht deshalb auf der Ausnahmeliste des Guard-Scans (§3.8.2, Eintrag 2). Danach tippt die Helferin
erneut auf „Abschließen".

⚠️ **Das ist keine Verlängerung „auf Knopfdruck" im Sinne von §3.4.3, sondern das dort geforderte
„erneut scannen" — nur ohne die Seite zu verlassen.** Ohne erneute Code-Eingabe passiert nichts.

Bei `grund === "gesperrt"` erscheint das Feld **nicht** — ein erneutes Einlösen desselben Codes
scheitert genauso, und ein Feld anzubieten, das nicht helfen kann, ist schlimmer als keins.

---

### 7.5 Rate-Limit und die Absenderadresse

**Die Absenderadresse, die drei Zähler und der Verbrauchszeitpunkt sind vollständig in §3.5
entschieden** — einschließlich der Begründung, warum `core/ratelimit.ts` nicht angefasst wird und
warum `x-forwarded-for` in **keiner** Richtung gelesen wird. Dieses Kapitel trägt drei Dinge nach,
die den Helfer-Weg unmittelbar betreffen.

#### 7.5.1 Warum das hier eine Sicherheitsfrage ist und keine Lastfrage

`/t/<code>`, die Gate-Action und `erneuereSitzung` sind die einzigen Wege in eine Helfer-Sitzung.
Coderaum **10⁶** (`tokens.ts:10,15`), Codes im Klartext auf laminierten Kärtchen, und
`implementierungsplan.md` §6 nennt das Rate-Limit als eine von vier Kompensationen dafür. Ein Treffer
gibt Lesezugriff auf den gesamten Bestand **und** Entnahmebuchung (`buchung.ts:82`) sowie
Check-Abschluss (`check.ts:72`). Die Sweep-Rechnung steht in §3.5.3.

#### 7.5.2 Die drei Gate-Flächen tragen dieselben Riegel

Verbindlich, in dieser Reihenfolge, an **allen drei** Stellen:

```
1. Host-Riegel                                    (§2.6)
2. gesperrt?  → ja: grund=zuviele, OHNE Datenbankzugriff
3. Code normalisieren                             (§7.5.3)
4. redeemToken(normalisierterCode, getDb())       (§7.13.2 — ein Handle, ein Weg: §5.13.2)
5. Erfolg → Cookie setzen, umleiten.  KEIN Budgetverbrauch.
6. Misserfolg → die drei Zähler buchen, Sperrzeit merken, grund=code
```

⚠️ **Schritt 2 ist es, der den Datenbankzugriff schützt — nicht der Absender-Eimer.** Wer den
Absenderschlüssel rotiert, startet jeden Versuch mit leerem Absender-Eimer und bekäme so oder so
genau einen Lookup; gedeckelt wird das ausschließlich durch die beiden modulweiten Zähler, und die
lesen ihre Sperrzeit **vor** jedem DB-Zugriff (§3.5.3).

#### 7.5.3 Der Bindestrich — die billigste Maßnahme gegen den gemeinsamen Eimer (Falle 24)

`redeemToken` normalisiert `trim().toUpperCase()` (`token-redeem.ts:13`) — auf einer Ziffernfolge
wirkungslos — und sucht auf Gleichheit (`:14`); der Generator setzt den Bindestrich fest zwischen
Position 3 und 4 (`tokens.ts:15`). **Die Eingabe `123456` findet `123-456` nicht.** Und der
Bucket-Schlüssel bündelt: alle Helferinnen hinter demselben Uplink (ein Anschluss, oder Mobilfunk
hinter CGNAT) teilen sich fünf Fehlversuche pro Minute.

**Entschieden:** eine Funktion, drei Aufrufer (`/t/<code>`, `einloesenAmGate`, `erneuereSitzung`):

```ts
// src/app/m/lagerbuch/_lib/code.ts        (KEIN "use client")
/**
 * Kanonische Form eines Zugangs-Codes: 6 Ziffern mit Bindestrich nach der
 * dritten (Erzeugerform, tokens.ts:15). Die Suche laeuft auf Gleichheit gegen
 * `tokens.code`, deshalb wird die EINGABE auf die Erzeugerform gebracht und
 * nicht die Spalte aufgeweicht. Damit kann die Normalisierung nur Treffer
 * HINZUFUEGEN, nie einen bestehenden verlieren — genau deshalb ist sie sicher.
 *
 * Der `[^0-9A-Z]`-Filter ist bewusst weiter als sechs Ziffern: sollte der
 * Betreiber je alphanumerische Codes ausgeben, bleibt die Funktion richtig,
 * statt still zu verstuemmeln.
 */
export function normalisiereCode(roh: string): string {
  const nur = roh.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^\d{6}$/.test(nur) ? `${nur.slice(0, 3)}-${nur.slice(3)}` : nur;
}
```

Zusammen mit `inputMode="numeric"`, `maxlength="7"` und `pattern` am Feld (§7.2.4) ist das die
vollständige Abhilfe.

---

### 7.6 Der Barcode-Scanner — die Kamera-Insel und der Vertrag mit der Außenwelt

#### 7.6.1 Was der Scanner ist, und wo er steht

`@zxing` ist eine **Kamera-Client-Insel** und bleibt eine — heute schon sauber gebaut: dynamischer
Doppelimport, die zxing-Bündel laden erst beim Betreten der Seite (`BarcodeScanner.tsx:66-69`), das
`zuBarcode`-Prop ist eine Server Action aus zwei 13-Zeilen-Hüllen, die Elternseiten bleiben Server
Components (Falle 44).

**Sie steht nicht auf dem Helfer-Weg** (§7.2.1), sondern an zwei Verwaltungsrouten. Die Aufteilung:

| Gegenstand | Kapitel |
|---|---|
| `src/app/m/lagerbuch/_ui/BarcodeScanner.tsx` — Bauform, Zustände, Normalisierung | **hier** |
| `src/app/m/lagerbuch/_lib/barcode.ts` — `normalisiereBarcode` | **hier** |
| `/verwaltung/geraete/scan`, `/verwaltung/bz/scan` — Seiten, Server Actions, Zielrouten | §6.2.2 (Zeilen 11 und 17), §6.4.9 |
| `/g/[code]` — Deep-Link, Rollen-Weiche, gestalteter Nicht-Treffer | §8.1, §11.3 |

#### 7.6.2 Ja, er scannt fremde Codes — und deshalb ist das Eingabeformat ein Vertrag

`POSSIBLE_FORMATS` umfasst **CODE_128, CODE_39, EAN_13, EAN_8, ITF, QR_CODE, DATA_MATRIX**
(`BarcodeScanner.tsx:71-79`). EAN und ITF sind reine Handels- und Herstellercodierungen; sie stehen
auf keinem lagerbuch-Etikett, sondern vom Hersteller gedruckt am Gerät. Der Abgleich ist binär —
`geraete.ts:77` und `bz.ts:120`, Spalten ohne `COLLATE` (Falle 29).

**Entschieden: die sieben Formate bleiben zeichengleich — 1:1-Pflicht.** Ein Format zu entfernen macht
jeden bereits erfassten Hersteller-Barcode unlesbar, und die Gegenstände sind physisch vorhanden. Ein
Format hinzuzufügen ist harmlos, aber unbegründet.

**Entschieden: die Normalisierung wird an EINER Stelle festgeschrieben und von allen Lesern benutzt.**
Die Anwendung normalisiert heute konsistent — Schreibweg `z.string().trim().optional()`
(`actions/geraete.ts:17`, `actions/bz.ts:15`), Leseweg `code.trim()` (`geraete.ts:70`) — mit **einer**
Ausnahme: `g/[code]/page.tsx:29,31` reicht den Routen-Parameter roh durch.

```ts
// src/app/m/lagerbuch/_lib/barcode.ts     (KEIN "use client")
/**
 * Rohwert (Kamera, Tippfeld, Routen-Parameter) → Wert fuer den Abgleich.
 *  1. QR mit `/g/<code>`-Deep-Link: nur das Segment zaehlt. Deshalb ueberlebt so
 *     ein Aufkleber einen Domainwechsel — sofern IN der App gescannt (Falle 30).
 *  2. Sonst getrimmt: der Abgleich ist binaer, die Spalten haben kein COLLATE.
 * DER CUTOVER-IMPORT MUSS DIESELBE FUNKTION BENUTZEN (§4.8).
 */
export function normalisiereBarcode(roh: string): string {
  const treffer = roh.match(/\/g\/([^/?#]+)/);
  return (treffer ? decodeURIComponent(treffer[1]) : roh).trim();
}
```

Aufrufer: die Kamera-Rückgabe (`BarcodeScanner.tsx:86`), das manuelle Feld (`:149`), die beiden
Server Actions (`geraetZuBarcode`, `bzZuBarcode`) und `/g/[code]`. Damit fällt die eine
unnormalisierte Lesestelle weg, und die Regel steht an einem Ort statt an fünfen.

⚠️ **Annahme:** dass Hersteller-EANs tatsächlich im Bestand stehen, ist nicht belegt (offene
Betreiberfrage). Die Entscheidung ist gegen beide Antworten robust: Formate zu behalten kostet
nichts, sie zu entfernen ist gegen gedruckte Hardware unumkehrbar.

⚠️ **Konsequenz für den Cutover, die hierher gehört, obwohl die Domain in §8.1 entschieden wird:**
`/g/<code>`-QR-Aufkleber wurden außerhalb der Anwendung gedruckt — `etikettenDaten` erzeugt
ausschließlich `/a/`- und `/t/`-URLs (`etiketten.ts:19,23`). Ein solcher Aufkleber, **mit der
Systemkamera** gescannt, öffnet die dort aufgedruckte Domain. Wechselt die Domain, sterben genau diese
Aufkleber. → **Runbook-Schritt:** die Alt-Domain nach dem Cutover weiterleiten lassen, oder in der
Übergabe festhalten, dass außerhalb gedruckte Geräteaufkleber neu erzeugt werden müssen.

#### 7.6.3 Ohne Kameraerlaubnis — vier Zustände statt einem

Heute fängt ein einziges `catch` alles und zeigt einen Satz: „Kamera nicht verfügbar oder Zugriff
abgelehnt – Barcode unten eintippen." (`BarcodeScanner.tsx:90-91`). Für jemanden, der in einer
Fahrzeughalle steht, ist das die falsche Auskunft: die Handlung unterscheidet sich je Ursache.

**Entschieden:** der Fehler wird ausgewertet (`err instanceof DOMException`, `err.name`):

| Zustand | Erkennung | Text |
|---|---|---|
| Kein sicherer Kontext | `!window.isSecureContext` oder `!navigator.mediaDevices` **vor** dem Import | „Die Kamera braucht eine verschlüsselte Verbindung. Bitte die Seite über die normale Adresse aufrufen, nicht über die IP." |
| Zugriff abgelehnt | `NotAllowedError` / `SecurityError` | „Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite freigeben — oder den Barcode unten eintippen." |
| Keine Kamera vorhanden | `NotFoundError` / `OverconstrainedError` | „Keine Rückkamera gefunden. Barcode bitte unten eintippen." |
| Kamera belegt | `NotReadableError` / `AbortError` | „Die Kamera wird gerade von einer anderen App benutzt. Diese schließen oder den Barcode unten eintippen." |

**Der sichere Kontext wird VOR dem dynamischen Import geprüft** — sonst lädt das Gerät zwei
zxing-Bündel, um danach festzustellen, dass es sie nicht benutzen kann. Das ist zugleich der
Berührungspunkt mit der Betriebsauflage aus §3.5.2: über den **direkten** Weg
(`http://<ip>:<port>`) ist `getUserMedia` gar nicht verfügbar; der Scanner ist auf diesem Weg
strukturell unbenutzbar. Der erste Zustand sagt das ausdrücklich.

**1:1-Pflicht: das manuelle Feld steht immer.** Heute wird es unbedingt gerendert
(`BarcodeScanner.tsx:141-163`), unabhängig vom Kamerazustand — nur der Videobereich wird durch die
Fehlerkarte ersetzt (`:110-137`). Das bleibt so. Ein manuelles Feld, das sich hinter einem
Kamerafehler versteckt, ist kein Rückfall.

**1:1-Pflicht: die Doppelfeuer-Sperre.** `busyRef` verhindert parallele Lookups, weil zxing denselben
Code viele Male pro Sekunde meldet (`:24,34-37`); nach der Navigation bleibt `busy` gesetzt, „sonst
navigiert ein Folge-Scan doppelt" (`:46`); ein unbekannter Code wird für 2 Sekunden gesperrt
(`:55-57`). Diese drei Zeilen sind gegen die Kamera erprobt und lassen sich in keinem Gate
nachbauen — sie wandern wörtlich mit, samt Kommentaren.

**1:1-Pflicht: die harte Navigation.** `window.location.assign(zielUrl(treffer.id))` (`:45`) bleibt,
mit der Begründung aus `:42-44` (Soft-Navigation direkt nach einer Server Action wird gern
abgebrochen). Das Ziel ist ein **äußerer** Pfad und bleibt es (§2.1 g, Schreibrichtung).

#### 7.6.4 Der Taschenlampen-Schalter ist Falle 2, nicht Kosmetik

Der Schalter sitzt absolut über dem Videobild und färbt sich per **Inline-Style** aus
`var(--rot)`/`var(--tinte)` (`BarcodeScanner.tsx:129-130`). Das ist eigenes Markup **außerhalb** eines
antd-Komponentenbaums — dort sind `--ant-*`-Variablen nicht sichtbar, weil antd sie auf seiner
Scope-Klasse deklariert und nicht auf `:root`. Wer beim Portieren `var(--rot)` reflexartig durch
`var(--ant-color-primary)` ersetzt, bekommt einen Knopf ohne Hintergrundfarbe — **still**, weil eine
nicht auflösbare CSS-Variable gültiges CSS ist und auf transparent zurückfällt.

**Verbindlich:** `var(--lb-rot)` / `var(--lb-tinte)` aus dem Modul-CSS (§7.7.4). Repo-weit ist das
ohnehin gesperrt (`core/shell/shell-css.test.ts:97-98`, `src/app/not-found.test.tsx:92`).

`switchTorch` bleibt optional geprüft (`:101-102`) — nicht jedes Gerät und nicht jeder Browser kann
es, und ein Wurf beim Antippen wäre ein Absturz mitten im Scannen.

---

### 7.7 Die Suite-Oberflächenregeln am mobilen Fall

#### 7.7.1 Ein Breakpoint — und dieses Modul erfindet keinen zweiten, auch keinen eigenen

**768px ist der einzige Breakpoint der Suite** (= antds `md`, festgehalten in
`core/shell/shell-css.test.ts`); in `max-width`-Abfragen heißt er **767.98px**, weil bei exakt 768px
sonst beide Seiten gelten und die Stylesheet-Reihenfolge entscheidet
(`docs/design/README.md`, Abschnitt „Mobil").

**Entschieden: `helfer.module.css` enthält NULL Media Queries.** Der Rahmen ist fluid mit einer
Obergrenze:

```css
.rahmen {
  width: 100%;
  max-width: 560px;          /* kein Breakpoint — eine Obergrenze */
  margin-inline: auto;
  height: 100dvh;
  display: flex; flex-direction: column;
  background: var(--lb-papier);
  overflow: hidden;
}
```

Eine Ansicht, die es nur in einer Fassung gibt, kann keinen zweiten Breakpoint einführen. Auf 1280px
steht der Rahmen mittig und trägt die Tab-Leiste weiterhin unten — dieselbe Oberfläche, keine
„Desktop-Fassung". `100dvh` statt `100vh` bleibt (`globals.css:129` führt beide, `dvh` gewinnt): es
ist der Grund, warum die Tab-Leiste unter einer eingeblendeten Adressleiste nicht verschwindet.

Die einzige Stelle im Modul, an der ein `max-width: 767.98px` überhaupt auftauchen darf, ist die
Verwaltungsoberfläche (§6.8.6). Ein Vitest-Quelltext-Scan über **alle** `.css`-Dateien unter
`m/lagerbuch/**` — nicht nur `_ui/*.module.css`, sonst fiele `(druck)/druck.css` heraus (§6.10.2) —
hält fest, dass unter `_ui/helfer.module.css` **keine** `@media (max-width` steht, und dass jede
vorhandene `max-width`-Abfrage `767.98` schreibt — das ist genau der Fehler, den `feedback.css`
bis 2026-07-27 mit 600px hatte. ⚠️ lagerbuch schaltet heute bei **760px**
(`globals.css:250`, die einzige Breiten-Media-Query des Moduls); das ist derselbe Fall, und er ist an
beiden Enden unsichtbar.

#### 7.7.2 Zoom gesperrt und 16px — die Auflösung des 13px-Verfallsfelds

Die Suite sperrt den Zoom (`maximumScale: 1, userScalable: false`, `src/app/layout.tsx`,
`viewport`-Export) und zieht deshalb eine 16px-Untergrenze für Eingabefelder
(`src/app/globals.css:53-56`). Die beiden Regeln sind ausdrücklich **eine Einheit**: ohne Zoom kann
niemand mehr heranholen, was zu klein ist (`docs/design/README.md`, „Mobil"). lagerbuch hat heute
**keine** von beiden — kein `viewport`-Export im Root-Layout (`lagerbuch/src/app/layout.tsx:25-30`
setzt nur `title` und `manifest`), und die Felder liegen bei 13–15px.

Der Riegel dagegen, `core/theme/feldschrift.test.ts:114-141`, fängt von lagerbuchs untergrößigen
Feldern genau **eines** — und das ist unseres:

```
.verfallfeld .input{width:auto;flex:none;padding:6px 8px;font-size:13px}
                                                          ^^^^^^^^^^^^^  globals.css:113
```

Der Kommentar darüber nennt den Grund: „kompakt, damit Menge und Datum in einer Zeile bleiben"
(`:110`, eingeführt mit `06a04f6` am 28.07.2026). **Die Auflösung ist nicht kosmetisch:** 16px statt
13px bricht genau diese Einzeiligkeit. Drei weitere Felder kommen durch den Riegel **durch**, weil er
nur die Langform `font-size:` liest und nach Selektortext filtert — `.input` mit `font:500 14px …`
(`:80`), `.combo-input` (`:83`) und `.stepper.sm .stepval` mit 15px (`:76`), obwohl `.stepval`
(`Stepper.tsx:52`) ein echtes `<input>` ist. **Das ist eine Lücke in einem Suite-Gate, kein
Modulbefund** — wer den grünen Test als bestandene Prüfung liest, portiert drei zu kleine Felder in
eine Anwendung ohne Zoom. §7.12.2 schließt sie modul-lokal.

**Entschieden, in vier Teilen:**

1. **Alle Eingabefelder des Helfer-Wegs liegen bei ≥ 16px.** Ohne Ausnahme, ohne Spezifitätstrick.
   Betroffen: das Verfallsfeld (13 → **18**, siehe Punkt 4), die Artikelsuche (14 → 16), das
   Gate-Zahlenfeld (bereits 21, wird 24), das Mengenfeld im Stepper (15/21 → 20, siehe §7.7.3).
2. **Das Verfallsfeld verlässt die Zeile und bekommt eine eigene, volle Zeile unter der Zählzeile.**
   Die Einzeiligkeit wird aufgegeben, nicht die Schriftgröße. Das ist die einzige Richtung, in der die
   Entscheidung fallen kann: eine 16px-Untergrenze, die man umgeht, wäre keine.

   ```
   ┌──────────────────────────────────────────────┐
   │ ⬤  Kompresse 10×10                    ┌────┐ │   ← Zählzeile
   │    Soll 20 Stk · [nachfüllen 4]       │- 16│ │      Stepper 56px (§7.7.3)
   │                                       └────┘ │
   │  🗓  [ 2027-03            ]                  │   ← Verfallszeile, volle Breite,
   └──────────────────────────────────────────────┘      18px, Höhe 56px
   ```

3. **Die zweite Zeile fällt bei Artikeln in mehreren Fächern ersatzlos weg.** Heute steht dort
   `<small>Verfall bei {zeile.fachLabel} angeben</small>` (`CheckFlow.tsx:290`) — eine ganze Zeile für
   einen Hinweis. Der Statuschip in der Meta-Zeile (`:273`) trägt die Angabe bereits und ist in jeder
   Zeile desselben Artikels sichtbar. Damit ist die Zeilenhöhe für Wiederholzeilen niedriger als
   heute, was einen Teil des 56px-Aufschlags aus §7.7.3 zurückholt.
4. **Das Feld bleibt ein natives `<input type="month">`.** Kein antd-`DatePicker`. Drei Gründe: die
   Klasse ist ohnehin ohne antd (§7.1); die native Monatsauswahl von iOS und Android ist mit
   Handschuhen einhändig bedienbar, ein 280px-Panel mit Zellrastern nicht; und es entfällt jede
   Dayjs-Umrechnung. `pattern="\d{4}-\d{2}"` und `inputMode="numeric"` bleiben (`CheckFlow.tsx:283`)
   — sie sind der Rückfall für Browser, die `type="month"` als Textfeld rendern. **Die Strenge selbst
   ist serverseitig** (`MONAT_REGEX`, §4.6).
   ⚠️ **Der vierte Grund, der hier einmal stand, trägt nicht:** der E2E-Selektor
   `input[type="month"]` (`loeschen.spec.ts:35`, `verwaltung-flow.spec.ts:45`) greift **nicht** dieses
   Feld, sondern beide Male `ArtikelDrawer.tsx:307` — ein **Verwaltungs**-Feld (nachgeprüft am
   Bestand: beide Zusicherungen laufen innerhalb von `page.locator(".drawer")`). Die drei
   Verwaltungs-Monatsfelder bekommen antd-Ersatz (§4.6, §6.11), und damit stirbt der Selektor an
   beiden Fundstellen. Die Entscheidung dieses Punktes bleibt davon unberührt — sie gilt für
   `CheckFlow.tsx:280` —, ihre Reichweite ist nur kleiner als angenommen (§12.3).

Das Modul-CSS erhöht dafür **nirgends** die Spezifität gegen eine Suite-Regel. Falle 5 der Suite
(„eigene Regel zu schwach / zu stark / Gleichstand") entsteht auf diesem Ast nicht, weil es keinen
antd-Gegenspieler gibt: `input, textarea, select { font-size: 16px }` (`globals.css:53-56`) ist (0,0,1)
und wird von `.verfallZeile input` (0,1,1) regulär überstimmt — nach oben, nicht nach unten. Genau
deshalb steht in dieser Datei ein Kommentar, der die Richtung festhält:

```css
/*
 * Erhoeht die Suite-Untergrenze von 16 auf 18, senkt sie NIE. Wer hier eine
 * kleinere Zahl eintraegt, hebelt `core/theme/feldschrift.test.ts` NICHT aus —
 * der Scan liest den Selektortext und die Zahl, `.verfallZeile input` matcht,
 * und der Test wird rot. Das ist Absicht.
 */
.verfallZeile input { font-size: 18px; min-height: 56px; }
```

⚠️ **Der `viewport`-Export selbst gehört der Suite** (`src/app/layout.tsx`) und ist bereits gesetzt;
dieses Modul erbt ihn und darf ihn nicht überschreiben. Ein Modul-`viewport`-Export wäre die
naheliegende Übernahme aus lagerbuch — dort gibt es keinen, hier gäbe es dann zwei.

#### 7.7.3 56px Tap-Maß gegen die Dichte der Zählliste (Entscheidung 33, Option d)

`core/theme/tokens.ts:33` setzt `TAP = 56` mit der Begründung „Bedienung mit Handschuhen … eine
Einsatzanforderung, keine Stilfrage". lagerbuch liegt darunter: `.stepbtn` 42×42 (`globals.css:73`),
`.stepval` 56×42 (`:74`), `.stepper.sm` 30×30 bzw. 46×30 (`:75-76`). Die einzige Ausnahme, die die
Suite kennt, ist `size="small"` **innerhalb von Tabellenzeilen** (`docs/design/README.md`, Falle 4) —
die Zählzeilen sind aber Kartenzeilen, nicht `<table>`.

**Entschieden: Option (d) der Analyse — der Stepper bleibt ein modul-eigenes Bedienelement, mit
Suite-Tap-Maß an den ±-Flächen und kompakter Ziffernanzeige dazwischen.** Kein `InputNumber`, kein
`Form.Item`.

```css
.stepper   { display:flex; align-items:center; border:1.5px solid var(--lb-linie);
             border-radius:12px; background:var(--lb-karte); flex:none }
.stepTaste { width:56px; height:56px; display:flex; align-items:center; justify-content:center }
.stepWert  { min-width:56px; height:56px; text-align:center; background:transparent; border:0;
             font:700 20px/1 var(--lb-display); font-variant-numeric: tabular-nums; padding:0 }
```

Die `sm`-Variante entfällt; es gibt genau eine Größe. **Die Gegenrechnung:** 30 → 56px sind 26px je
Zählzeile (`CheckFlow.tsx:295`), auf zwanzig Positionen etwa 520px — gut ein halber Bildschirm. Ein
Teil kommt über den Wegfall der Hinweiszeile bei Wiederholzeilen zurück (§7.7.2 Punkt 3, −18px). Der
Rest wird akzeptiert: eine Zeile, die man mit Handschuhen nicht trifft, ist teurer als eine, die man
scrollen muss.

**Drei Eigenschaften des heutigen Steppers sind 1:1-Pflicht:**

1. **Die `noText`-Variante bleibt.** `Stepper.tsx:19-21` begründet sie: der Wert ist dort **bewusst**
   nicht tippbar, „damit unterwegs am Handy nicht versehentlich ins Zahlenfeld getippt wird". Genutzt
   in `CheckFlow.tsx:295` (Zählen) und `:461` (Nachfüllen) — beides Stellen, an denen ein
   Fehlgriff eine falsche Bestandsbuchung ist.
2. **Der `draft`-Zustand bleibt, und der Parent-Wert bleibt die Quelle der Wahrheit.**
   `Stepper.tsx:24-28` löst einen echten Konflikt und schreibt ihn aus: „So bleibt der Parent-Wert die
   Quelle der Wahrheit und Klicks/Tastatur lesen nie einen veralteten Wert zurück." Wer den Stepper auf
   ein formulargebundenes `InputNumber` hebt, baut eine **dritte** Zustandsquelle auf — in einem Feld,
   dessen falscher Wert eine falsche Bestandsbuchung ist (Falle 45). Option (d) löst diese Falle
   nebenbei mit.
3. **Die großzügigen Obergrenzen bleiben.** `max={9999}` beim Zählen (`CheckFlow.tsx:295`) und beim
   Druck (`:402`), jeweils mit Kommentar: echter Überbestand muss zählbar sein, sonst korrigiert der
   Abgleich real vorhandene Teile still heraus; eine überfüllte Flasche muss ablesbar bleiben.
   ⚠️ Die **serverseitigen** Deckel liegen darüber (99 999 bzw. 9 999, §5.15) — sie fangen den
   Tippfehler, nicht die Bedienung.

`aria-label="Menge verringern"` / `"Menge erhöhen"` (`Stepper.tsx:46,63`) bleiben — mit 56px-Flächen
ohne Text sind sie die einzige Benennung.

#### 7.7.4 Farben, Ikonen, Ziffern, Bewegung

**Farben.** Der Farbsatz ist bereits identisch: `lagerbuch/src/app/globals.css:4-15` und
`core/theme/tokens.ts:14-25` führen dieselben zwölf Hexwerte unter denselben deutschen Namen. Auf dem
Helfer-Ast gilt:

- Eigene Modulvariablen `--lb-*` auf dem Rahmen-Element, **nie** `--ant-*` (Falle 2). Es gibt hier
  keinen antd-Komponentenbaum, also sähe eigenes Markup die Variablen ohnehin nicht — der Fehler wäre
  still.
- Beide Modi: die Variablen werden unter `:root[data-theme="dark"]` überschrieben, nicht über
  `prefers-color-scheme`.
- **Rot steht nie auf einer Datenfläche.** `colorError === colorPrimary === #c8000f` (Falle 3): Rot ist
  Marke und Primäraktion. Auf dem Helfer-Weg trägt Rot zugleich fachliche Bedeutung („abgelaufen",
  „fehlt", „niedrig"). Auflösung: der Primärknopf („Entnahme buchen", „Abschließen") bleibt rot, weil
  er die Handlung ist; **Statuschips und Plakette** beziehen ihre Farbe aus der fachsemantischen
  Palette in `_lib/ampel.ts` (§5.17). Die konkreten Hexwerte und die Luminanzfrage entscheidet
  Entscheidung 30 (**§6.6.2**, samt der Frage, wie sie ins CSS kommen: §6.6.2a); dieses Kapitel legt
  fest, **dass** der Helfer-Weg seine Statusfarben von
  dort bezieht und **dass jeder Status zusätzlich Text trägt** — das tut er heute schon
  (`chargeText`, `CheckFlow.tsx:113`; „fehlt"/„vorhanden", `:338-339`; „niedrig", `:398`).

**Ikonen.** Der Helfer-Weg braucht rund achtzehn Zeichen. **Entschieden: Inline-SVG in
`src/app/m/lagerbuch/_ui/ikonen.tsx`**, nach dem Vorbild `m/files/(verwaltung)/shares/[id]/page.tsx:180-198`
(eine Komponente, eine Pfad-Tabelle). Gründe: die Klasse ist ohne antd, also stellt sich Falle 7 nicht;
eine neue Abhängigkeit wäre für achtzehn Pfade unverhältnismäßig; und die Suite hat `lucide-react`
nicht im Baum (`package.json` führt `@ant-design/icons` und `antd`, kein lucide).

⚠️ **Es ist dieselbe Datei wie die der Verwaltung, und die vollständige Namensunion gehört §6.5.2**
— 36 Namen, Vorgabegröße **18px**, dazu der modul-eigene Riegel `_ui/ikonen.test.ts` (§6.5.5) und
das Verbot, `@ant-design/icons` **irgendwo** unter `m/lagerbuch/` zu importieren, auch in einer
Client-Insel (§6.5.1). Die achtzehn Zeichen dieses Wegs sind eine Teilmenge davon; die sieben
Fachzeichen unten stehen dort als acht (mit `fahrzeug`, das nur die Verwaltung braucht).

**Zwei Fallen an genau dieser Datei, gegenläufig — sie darf keine der beiden auslösen:**

```tsx
// src/app/m/lagerbuch/_ui/ikonen.tsx
// KEIN "use client" — zwei gegenlaeufige Fallen:
//  * Falle 6: diese Datei exportiert mit PFADE einen WERT. Aus einem
//    "use client"-Modul bekaeme eine Server Component eine Client-Referenz
//    statt des Wertes → HTTP 500, und Vitest sieht es strukturell nicht.
//  * Falle 7 (Gegenrichtung) trifft nicht zu: nichts auf Modulebene, nur JSX.
// Damit aus Server Components UND aus Client-Inseln importierbar.
export const PFADE: Record<IkonName, string> = { … };   // Union: §6.5.2, 36 Namen
export function Ikone({ name, groesse = 18 }: { name: IkonName; groesse?: number }) { … }
```

**Sieben der achtzehn Zeichen tragen fachliche Bedeutung** und behalten ihre heutige Form, weil die
Helfer sie kennen: Herz-Puls und Paket unterscheiden die Geräteklassen „medizin" und „objekt"
(`CheckFlow.tsx:330`), Wind steht für Sauerstoff (`:392`), Kalender-Uhr für Verfall (`:279`),
Warndreieck für Auffälligkeit (`:266`), Häkchen für „in Ordnung" (`:266`), Paket-Lupe für den
Handlager-Griff (`:442`). Jedes von ihnen steht neben Text, nie allein
(`docs/design/README.md`, „Bedeutung nie allein über Farbe" — für Zeichen gilt dasselbe).

**Ziffern.** `font-variant-numeric: tabular-nums` kommt im gesamten lagerbuch-Repo **null** Mal vor;
die Ausrichtung hängt heute allein an IBM Plex Mono. Auf dem Helfer-Weg werden Ziffern verglichen —
Soll gegen Ist, Bestand, Druck in bar, Prozent. **Verbindlich:** `tabular-nums` auf `.stepWert`,
`.bestandsZahl`, `.mengenChip` und den Journal-/Druckziffern, unabhängig davon, welche Schrift
Entscheidung 32 wählt.

**Bewegung.** Der Scanstrich hat heute schon einen `prefers-reduced-motion`-Zweig
(`globals.css:158-160`) und behält ihn. Das ist die einzige Animation des Wegs.

**Fokus.** `outline` mit `outline-offset`, nie `outline: none` ohne Ersatz. Heute
`lagerbuch/src/app/globals.css:40` (`button:focus-visible, input:focus-visible, select:focus-visible`) — wandert
zeichengleich ins Modul-CSS, weil die Suite-Regel nur antd-Komponenten erreicht.

---

### 7.8 Falle 63 — die Aktivmarkierung, und warum `usePathname` auf diesem Ast gar nicht vorkommt

#### 7.8.1 Der Befund

`decideRoute` schreibt jeden Pfad des Modul-Hosts auf `/m/lagerbuch/<pfad>` um
(`core/routing.ts:78-79`). `HelferFrame.tsx:8-9` steuert die zwei Tabs mit
`pathname.startsWith("/helfer/check")` (`:26-27`).

**Die Suite hat gemessen, welcher Pfad ankommt, und das kehrt die naheliegende Bewertung um.**
`core/shell/SuiteNav.tsx:88-95` hält den Messaufbau fest: ein `data-pfad`-Attribut am `modulnav`,
`curl` gegen `qr.localtest.me` unter Next 16.2.6 — `/` → `/`, `/wifi` → `/wifi`. **`usePathname()`
liefert den ÄUSSEREN Pfad.** Auf dem regulären Weg funktioniert `HelferFrame` also weiter. Wer diese
Stelle als „bricht unter dem Rewrite" notiert, notiert etwas Falsches.

**Was wirklich bricht, ist der zweite Weg.** `core/routing.ts:54-67` behandelt bereits präfixierte
Pfade eigens und schließt `/m/*` **bewusst nicht** aus dem Matcher aus (`proxy.ts:102-104` nimmt alles
außer `_next/static`, `_next/image`, `favicon.ico`). `/m/lagerbuch/helfer/check` rendert also — von
**jedem** Suite-Host aus (Falle 61, gegen den §2.6 den Riegel setzt). Auf diesem Pfad beginnt
`/m/lagerbuch/helfer/check` nicht mit `/helfer/check`, und die Tab-Leiste markierte dauerhaft
„Entnahme", auch im Fahrzeug-Check.

**Und die Messung hat zwei Ränder, die dazugehören:** sie steht gegen Next 16.2.6
(`SuiteNav.tsx:92`), die Suite fährt 16.2.11 (`package.json:28`); und sie entstand per `curl` gegen
den Dev-Server auf Wildcard-DNS, ohne Reverse-Proxy davor. Der Befund ist weder widerlegt noch
nachgemessen — genau deshalb ist der E2E unten Pflicht und nicht Zierrat.

#### 7.8.2 Die Auflage für jede Aktivmarkierung im Neubau

**1. `usePathname` kommt unter `src/app/m/lagerbuch/` nicht vor. Verbindlich, mit Testriegel**
(§3.8.2). Der Server kennt das Segment ohnehin. `HelferRahmen` bekommt es als Prop:

```tsx
// src/app/m/lagerbuch/_ui/HelferRahmen.tsx
export function HelferRahmen({
  aktiv,            // "entnahme" | "check" — KEIN usePathname, KEIN startsWith.
  sitzungsetikett,
  laeuftAb,         // Pflicht, NICHT optional — §3.4.3 Punkt 1 schreibt die Anzeige fest.
  children,
}: { aktiv: "entnahme" | "check"; sitzungsetikett: string; laeuftAb: Date;
     children: React.ReactNode }) {
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} />
      <header className={s.kopf}>…{sitzungsetikett}…
        {/* Die EINE Aufrufform. Uhrzeit und Schwelle rechnet der Server, die Insel
            zeigt und aktualisiert nur (§3.4.3 Punkt 1, Begruendung unter dem Block). */}
        <Restzeit uhrzeit={uhrzeit(laeuftAb)} laeuftAb={laeuftAb}
                  warntInitial={laeuftAb.getTime() - Date.now() <= 30 * 60_000} />
        <BeendenKnopf /></header>
      <main className={s.inhalt}>{children}</main>
      <nav className={s.tableiste} aria-label="Helfer-Bereiche" data-testid="lb-tableiste">
        <Link href="/helfer" className={s.tab}
              aria-current={aktiv === "entnahme" ? "page" : undefined}>…Entnahme</Link>
        <Link href="/helfer/check" className={s.tab}
              aria-current={aktiv === "check" ? "page" : undefined}>…Fahrzeug-Check</Link>
      </nav>
    </div>
  );
}
```

Der Rahmen wandert damit aus dem Layout in die drei Seiten, die ihn brauchen — `helfer/page.tsx`
(`aktiv="entnahme"`), `helfer/check/page.tsx` (`aktiv="check"`), `a/[artikelId]/page.tsx`
(`aktiv="entnahme"`). Das ist kaum eine Änderung: heute steht er bereits an zwei Stellen
(`helfer/layout.tsx:10` und `HelferDetail.tsx:6`). Das Layout behält den **Riegel** (§7.4.3), nicht den
Rahmen.

**Woher die drei Seiten `sitzungsetikett` und `laeuftAb` nehmen** — die Frage entsteht genau durch
diese Verschiebung und wird hier beantwortet, nicht offengelassen: **ein Layout kann einer Seite
keine Props reichen.** `helfer/page.tsx` und `helfer/check/page.tsx` rufen `requireHelferSitzung(getDb())`
deshalb **selbst noch einmal** (§7.4.3); der zweite Aufruf ist billig — dasselbe gecachte Handle
(§5.13.2) und derselbe Primärschlüssel-Lookup auf `tokens.id`. `a/[artikelId]/page.tsx` hat den Wert
ohnehin aus seiner eigenen Weiche (`helferZugangOderNull`), und sein Admin-Zweig **rendert gar
nicht**, sondern leitet um (`a/[artikelId]/page.tsx:14-19`) — nur deshalb dürfen beide Angaben
Pflicht-Props sein und keine Optionals.

```tsx
// src/app/m/lagerbuch/_ui/Restzeit.tsx   — "use client", die kleinste Insel des Moduls
/**
 * WARUM DAS EINE CLIENT-INSEL IST und nicht drei Zeilen im HelferRahmen:
 * die Schwelle aus §3.4.3 Punkt 1 („ab 30 Minuten") ist eine Aussage ueber die
 * VERGEHENDE Zeit. Ein Fahrzeug-Check ist zehn bis zwanzig Minuten ohne
 * Navigation (§7.4.4); serverseitig entschieden faellt der Hinweis genau bei
 * dem Menschen aus, fuer den er geschrieben wurde — bei dem, der mit 35 Minuten
 * Restlaufzeit anfaengt zu zaehlen.
 *
 * DIE UHRZEIT WIRD NICHT HIER GEBAUT. Sie kommt fertig vom Server
 * (`uhrzeit()` aus `_lib/zeit.ts`, §4.5): der Browser einer Helferin steht nicht
 * zwingend auf Europe/Berlin, und eine im Client formatierte Zeit waere eine
 * zweite Zonenquelle neben der einen, die §4.5 festlegt.
 *
 * `warntInitial` kommt ebenfalls vom Server und ist der Startwert des Zustands —
 * NICHT eine zweite Rechnung. Wuerde die Insel beim ersten Rendern selbst
 * `Date.now()` befragen, koennte sie an der Schwelle anders entscheiden als der
 * Server und Next meldete einen Hydrations-Unterschied. Ab dem ersten `useEffect`
 * rechnet nur noch der Client, im Minutentakt.
 */
export function Restzeit({ uhrzeit, laeuftAb, warntInitial }:
  { uhrzeit: string; laeuftAb: Date; warntInitial: boolean }) { … }
```

`HelferRahmen` bleibt damit selbst eine Server-Komponente; `_ui/Restzeit.tsx` ist die einzige neue
Datei dieser Zusage, und die Aufrufform steht genau einmal — im Kopf des Blocks oben.
⚠️ `laeuftAb.getTime() - Date.now()` ist **reine ms-Arithmetik** und gehört damit ausdrücklich
**nicht** nach `_lib/zeit.ts`: §5.16 führt genau diese Klasse als zonenunabhängig, und die
grep-bare Regel aus §4.5 verbietet `new Date(jahr, monat, …)` sowie `getHours`/`getMinutes`/
`getFullYear`/`getMonth`/`getDate` — `getTime` steht dort aus gutem Grund nicht. Zonenabhängig ist
allein die Anzeige, und die macht `uhrzeit()`.

**2. Die `href` sind ÄUSSERE Pfade und bleiben es.** `/helfer`, `/helfer/check`,
`/a/<id>`, `/helfer/check?fz=<id>`. Der Browser steht auf dem Modul-Host, `decideRoute` präfixiert
danach. Innere `href` (`/m/lagerbuch/helfer/check`) wären die naheliegende und falsche
Vereinheitlichung mit Falle 49 — sie würden auf dem äußeren Host doppelt präfixiert.

**3. Falls doch je eine Aktivmarkierung aus einem Pfad abgeleitet wird — Suffix, nie Präfix.**
`core/shell/SuiteNav.tsx:101-108` ist der Maßstab: `pfad === e.href || pfad.endsWith(e.href)`, der
spezifischste Nicht-Wurzel-Treffer gewinnt, die Wurzel ist Fallback mit `genau: pfad === "/"`. Diese
Funktion soll die Rewrite-Konvention ausdrücklich **nicht** kennen (`:97-99`) — ein
Präfix-Abschneiden von `/m/<key>` wäre die Alternative gewesen und ist bewusst nicht gewählt. **Eine
dritte, modul-eigene Auflösung in lagerbuch wäre der Ort, an dem Suite und Modul auseinanderlaufen.**

**4. `aria-current="page"` ist die Zusage, nicht die CSS-Klasse.** Die Klasse folgt daraus
(`.tab[aria-current="page"]`), nicht umgekehrt. Damit prüft der E2E dieselbe Sache, die die
Bildschirmleserin hört.

**5. Der E2E gegen den laufenden Server ist Pflicht, weil Vitest hier strukturell blind ist.**
`core/shell/SuiteNav.test.tsx:48` mockt `next/navigation`, und der Test sagt das über sich selbst
(`:263-266`). Für dieses Modul ist die Aussage eine andere und nicht kleiner: die `href` sind
äußere Pfade, und ob ein `<Link href="/helfer/check">` auf dem Modul-Host beim richtigen Segment
landet, weiß nur ein echter Abruf. Vorbild `e2e/shell-mobil.spec.ts:288-324`, drei Fälle:

| Aufruf (Modul-Host) | Erwartung |
|---|---|
| `/helfer` | genau ein `a[aria-current="page"]` in `[data-testid="lb-tableiste"]`, Text „Entnahme" |
| `/helfer/check` | genau ein `a[aria-current="page"]`, Text „Fahrzeug-Check" |
| `/a/<seed-id>` | genau ein `a[aria-current="page"]`, Text „Entnahme" — der Deep-Link ist Teil des Entnahme-Asts |

**6. Was der Helfer-Ast NICHT schreibt.** `useSearchParams` hat in lagerbuch null Konsumenten; der
Filterzustand wird ausschließlich serverseitig als `searchParams`-Prop gelesen
(`helfer/check/page.tsx:11-12`). Das bleibt so — die Suspense-Falle rund um `useSearchParams`
entsteht auf diesem Ast nicht. Und es gibt **keinen** `router.push`/`router.replace` auf dem
Helfer-Weg: die Fahrzeugwahl wird ein `<Link>` (§7.9.1), nicht ein Client-Schreiber.

---

### 7.9 Der Fahrzeug-Check

#### 7.9.1 Der Schnitt aufs Fahrzeug (Falle 15) — die eine Strukturänderung dieses Kapitels

Heute baut `helfer/check/page.tsx:16,19-21,23,24-26` vier `Object.fromEntries(fahrzeuge.map(...))`-
Wörterbücher und reicht sie **komplett** als Props an die Client-Komponente (`CheckFlow.tsx:50-58`);
`?fz=` wirkt nur als Vorauswahl (`page.tsx:28`). Damit wandert bei jedem Helfer-Aufruf die
Soll-Bestückung, Geräteliste, Flaschenliste und Verfallslage **der gesamten Organisation** in den
RSC-Payload — auf ein privates Telefon, in einer Sitzung ohne Konto (§3.4.5).

**Entschieden: die Seite schneidet auf das gewählte Fahrzeug, und die Wahl ist eine Navigation.**

```tsx
// src/app/m/lagerbuch/helfer/check/page.tsx      (Server Component)
export const dynamic = "force-dynamic";

export default async function CheckSeite({ searchParams }: { searchParams: Promise<{ fz?: string }> }) {
  // Host und Sitzung kommen aus helfer/layout.tsx (§7.4.3).
  const { fz } = await searchParams;
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);

  // Genau ein aktives Fahrzeug → keine Wahl anbieten. KEIN redirect: das
  // spart eine Anfrage und schreibt keinen Pfad, den jemand aeussern/innen
  // verwechseln koennte (§2.1 g).
  const gewaehlt = (fz && fahrzeuge.some((f) => f.id === fz) && fz)
    || (fahrzeuge.length === 1 ? fahrzeuge[0].id : null);

  if (fahrzeuge.length === 0) return <HelferRahmen aktiv="check" …><LeerZustand … /></HelferRahmen>;
  if (!gewaehlt) return <HelferRahmen aktiv="check" …><FahrzeugWahl fahrzeuge={fahrzeuge} /></HelferRahmen>;

  // Erst JETZT laden — und nur fuer dieses eine Fahrzeug.
  const soll     = sollFuerFahrzeug(db, gewaehlt).filter((p) => !p.entfernt);
  const geraete  = geraeteFuerLagerort(db, gewaehlt).map((g) => ({ id: g.id, typ: g.typ, name: g.name }));
  const flaschen = o2FlaschenFuerLagerort(db, gewaehlt);
  const verfall  = Object.fromEntries([...verfallFuerLagerort(db, gewaehlt)].map(([a, e]) => [a, e.verfall]));

  return <HelferRahmen aktiv="check" …><CheckFlow fahrzeug={…} soll={soll} geraete={geraete}
                              flaschen={flaschen} verfall={verfall}
                              warn={{ rot, gelb }} /></HelferRahmen>;
}
```

**Vier Folgen, alle gewollt:**

- Der RSC-Payload trägt genau ein Fahrzeug. Bei zehn Fahrzeugen ist das eine Zehntelung.
- `FahrzeugWahl` ist eine **Server Component** mit `<Link href={\`/helfer/check?fz=${id}\`}>` — heute
  ist es ein `useState`-Umschalter in der Client-Komponente (`CheckFlow.tsx:75-87`). Die Fahrzeugwahl
  ist damit adressierbar, teilbar und im Verlauf zurücknavigierbar.
- `CheckFlow` verliert die vier Wörterbücher und die `preselect`-Prop; es kennt nur noch **ein**
  Fahrzeug. Das ist der Moment, es zu tun — „danach nachzurüsten heißt, den Flow ein zweites Mal
  umzubauen" (Falle 15).
- Der Knopf „Weiterer Check" (`CheckFlow.tsx:210`, heute ein Zustandsreset über sieben Setter) wird
  zu zwei `<Link>`: „Nochmal dieses Fahrzeug" (`?fz=<id>`) und „Anderes Fahrzeug" (`/helfer/check`).
  Ein Seitenaufbau ist hier ohnehin gewollt — die Bestände haben sich gerade geändert.

⚠️ **Was der Schnitt NICHT ist: ein Riegel.** `tokens.scope_lagerort_id` ist heute Dekoration, ein
Fahrzeug-Code kann jedes Fahrzeug checken (Falle 14, §3.4.5). Für diese Spec bleibt es beim heutigen
Verhalten (Vorauswahl, kein Riegel), weil eine Verschärfung zur physischen Verteilung der Etiketten
passen muss und der Betreiber sie nicht beantwortet hat (§15). **Dieser Entwurf legt aber genau zwei
Orte fest, an denen eine spätere Durchsetzung ansetzt** — die Zeile, die `gewaehlt` berechnet, und die
erste Zeile von `checkAbschluss`. Mehr braucht es dann nicht. Die **Spalte** bleibt derweil im Schema
(§4.12).

#### 7.9.2 Die Schrittfolge bleibt adaptiv — 1:1

`CheckFlow.tsx:116-130` baut die Schrittfolge aus dem, was das Fahrzeug **hat**: Artikel bringen
`zaehlen` + `nachfuellen`, Geräte bringen `geraete`, Flaschen bringen `sauerstoff`. Der Commit passiert
immer im **letzten** Schritt der Folge (`istLetzter`, `:129`). Das ist 1:1-Pflicht — die Alternative
(feste vier Schritte mit Leerbildschirmen) ist auf einem Telefon im Fahrzeug messbar schlechter, und
die Logik ist erprobt.

Ebenso 1:1:

| Verhalten | Beleg | Warum es bleibt |
|---|---|---|
| Zählen: jede Position ist auf **Soll** vorbelegt, mit `−` runterzählen | `CheckFlow.tsx:97` | „voll annehmen, Gezähltes runterkorrigieren" — der Regelfall ist „alles da" (§5.8.1) |
| Der **recorded** Fahrzeugbestand wird bewusst NICHT als Per-Position-Default benutzt | `:94-96` | er ist pro Artikel, nicht pro Fach; derselbe Artikel in zwei Fächern würde sich vervielfachen (§5.7.1) |
| Verfall hängt am **Artikel**, nicht am Fach; nur die **erste** Zeile je Artikel trägt das Feld | `:100-109` | zwei Felder für eine Angabe wären nicht auseinanderzuhalten |
| Vorbelegt ist der beim letzten Check gemeldete Wert; leeren heißt „keine Angabe" | `:103-104`, `:152-155` | nur Geändertes wird gesendet, Unberührtes bleibt unberührt |
| Nachfüllen: greedy je Artikel über die Anzeigereihenfolge, gedeckelt an der Handlager-Verfügbarkeit | `:222-238` | der Vorschlag verspricht nie mehr, als der Handlager hergibt |
| Nachfüllen: der Helfer stellt ein, was er **wirklich** geholt hat | `:445`, `:461` (`max={luecke}`) | die Buchung folgt der Wirklichkeit, nicht dem Vorschlag |
| Geräte: alles auf **vorhanden · In Ordnung** vorbelegt, nur Abweichungen antippen | `:325`, `:132` | derselbe Grundsatz wie beim Zählen |
| Sauerstoff: jede Flasche auf den **Nennfülldruck** vorbelegt, runterstellen | `:136-137`, `:384` | ebenso — und der Grund, warum `o2_messungen` korrigierbar bleiben muss (§4.4, §5.12) |

#### 7.9.3 Die Ampel im Zählschritt wird im Client gerechnet — und das ist keine Zeitzonenfrage mehr

`CheckFlow.tsx:110-114` ruft `verfallStatus(wert, warn, new Date())` — im **Browser**.
`checkAbschluss` rechnet dieselbe Ampel serverseitig noch einmal (`check.ts:161-163` über
`verfallFuerLagerort`).

Heute bildet `verfallStatus` das Monatsende mit `new Date(y, m, 0, 23, 59, 59, 999)`
(`lib/domain/verfall.ts:10`) — **lokale Zeit**, also im Client die Zeitzone des Telefons und im Server
die des Containers. **Unter Entscheidung 26 (b) fällt dieser Unterschied weg**: `verfallStatus`
rechnet über `monatsEnde()` aus `_lib/zeit.ts`, und das ist zonenexplizit (§4.5). Ob die Funktion im
Browser oder im Container läuft, ändert das Ergebnis nicht mehr — Chip im Zählschritt und Zahl in der
Abschlussmeldung können **konstruktiv** nicht auseinanderfallen.

Das ist einer der vier Gewinne, die §4.5 für Entscheidung 26 (b) auflistet, und er ist der einzige,
der im Helfer-Weg unmittelbar sichtbar wird. ⚠️ **`TZ=Europe/Berlin` bleibt trotzdem Runbook-Eingabe**
— für Anzeigen außerhalb dieses Moduls und für die vier laufenden Module (§1.5). Das **Setzen** ist
nicht Teil dieser Spec.

#### 7.9.4 Der Abschluss — eine Transaktion, und was die Rückmeldung sagt

`checkAbschluss` bleibt **eine** Datenbanktransaktion, und die Reihenfolge bleibt zeichengleich —
vollständig in §5.8. Die vier Zugehörigkeitsprüfungen (`:126`, `:137`, `:153`, `:94`) bleiben Würfe
(§7.3).

**Die Rückmeldung** (`CheckFlow.tsx:173-212`) bleibt in Form und Inhalt, mit zwei Ergänzungen:

| Kennzahl | Text heute | Änderung |
|---|---|---|
| `nachgefuellt` | „N aus Handlager geholt" | — |
| `offen` | „N fehlt weiterhin" + Erläuterung | — |
| `geraeteAuffaellig` | „N Gerät(e) auffällig" | — |
| `flaschenAuffaellig` | „N Flasche(n) niedrig" | — |
| `verfallAuffaellig` | „N laufen ab" | — |
| **neu** | — | Wurde weniger nachgefüllt als bestätigt (Handlager war zwischenzeitlich leer), steht das ausdrücklich da: „Von N bestätigten Teilen konnten nur M gebucht werden." |
| **neu** | — | Flaschen ohne bekannten Nennfülldruck: „N Flasche(n) nicht bewertbar" (§5.12) |

Die vorletzte Zeile schließt dieselbe Lücke wie bei der Entnahme (§7.3): `umlagerung` kappt still an
der Verfügbarkeit, und der Helfer hat die Teile **in der Hand**. Ohne den Satz legt er sie ins
Fahrzeug und das Journal weiß es nicht.

#### 7.9.5 `revalidatePath` — die Gegenrichtung zu §2.1 g

Alle 61 `revalidatePath`-Aufrufe in lagerbuch übergeben den **äußeren** Pfad; alle vier vorhandenen
Suite-Module übergeben durchweg den **inneren** (Falle 49). Für die beiden Actions dieses Kapitels ist
die Liste damit:

```ts
// _actions/buchung.ts — bucheEntnahmeHelfer
revalidatePath(`/m/lagerbuch/a/${v.artikelId}`);
revalidatePath("/m/lagerbuch/helfer");
revalidatePath("/m/lagerbuch/verwaltung");

// _actions/check.ts — checkAbschluss
revalidatePath("/m/lagerbuch/helfer/check");
revalidatePath("/m/lagerbuch/verwaltung/checks");
revalidatePath("/m/lagerbuch/verwaltung");
revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
revalidatePath("/m/lagerbuch/verwaltung/verfall");
revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
```

**Innen hier, außen dort — und beide Sorten stehen in denselben Dateien.** Ein Kommentar an der
ersten Zeile jeder Action hält das fest, weil die Verwechslung genau hier passiert:

```ts
// INNERER Pfad (/m/lagerbuch/…). Gegenrichtung zu allem, was der Client
// schreibt und was in ein `Location` geht — das sind AEUSSERE Pfade (§7.2.5).
```

Da alle Helfer-Seiten `force-dynamic` sind, ist die praktische Wirkung dieser Aufrufe gering; falsch
sind sie trotzdem, und ein falscher Pfad, der nichts tut, wird beim nächsten Caching-Schritt zum
stillen Defekt. ⚠️ Die Listen der **Verwaltungs**-Actions sind enumerierbare Arbeit ohne Eigentümer in
diesem Dokument — auch §6 löst sie nicht ein (§0.3, Punkt 1; §15.3, Nr. 23).

---

### 7.10 Offline und PWA (Entscheidung 24)

#### 7.10.1 Entschieden: Option (a) — Manifest und Icons als Route Handler unter dem Modul, KEIN Service Worker

**Belegt ist der Ausgangspunkt:** lagerbuch hat **keinen** Service Worker (`grep` über `src/` und
`public/` nach `serviceWorker|workbox|sw.js`: null Treffer, Falle 56). Es ist installierbar, aber
nicht offlinefähig. **Der Umzug bringt hier keine Fähigkeit mit, die zu retten wäre.**

Fünf Gründe gegen einen Service Worker, und die ersten beiden sind bezahlte Lehren aus `qr`:

1. **Der qr-Service-Worker cachte die eingeloggte Startseite** (`7dcf2ee`). Eingeloggt trug `/` die
   vollständigen Preset-Objekte in der Client-Payload, bei `kind: "wifi"` samt Passwort; auf einem
   geteilten Einsatz-Tablet war die eingeloggte Startseite nach dem Logout offline weiter abrufbar.
   Die geplante Denylist hätte das nicht gefangen, weil die sensiblen Daten auf `/` lagen — und sie
   ließ die RSC-Antwort `/?_rsc=<hash>` durch, die dieselben Daten trägt. **Für lagerbuch wäre der
   Fall schärfer:** `/helfer` trägt die vollständige Artikelliste mit Beständen,
   `/helfer/check?fz=<id>` die Soll-Bestückung eines Fahrzeugs, und `beenden()` löscht nur das Cookie
   (`helfer/actions.ts:7`) — ein Cache überlebt es.
2. **Er ließ die Bodies nicht gecachter Antworten ungelesen** (Eintrag vom 2026-07-23). Im
   Service-Worker-Kontext legt das nach wenigen 404ern die Abruf-Pipeline still, `install` endet nie,
   der Worker bleibt dauerhaft `installing` — **gar keine PWA, ohne Fehlermeldung**. Und 404 ist nach
   jedem Redeploy ein **vorgesehener** Zustand (gecachtes HTML zeigt auf alte Bundle-Hashes). In
   Produktion hätte das nach jedem Deployment zugeschlagen. Behoben mit `releaseBody()`.
3. **Der Helfer-Weg ist ein Schreibweg.** Ein Service Worker macht Lesen offline möglich, Schreiben
   nicht. Das Ergebnis wäre der schlechteste Zustand: die Helferin sieht Bestände, tippt „Entnahme
   buchen", und die Buchung landet nirgends. Eine echte Offline-Fähigkeit bräuchte eine
   Ausgangswarteschlange mit Konfliktauflösung gegen FEFO — das ist ein eigenes Vorhaben, keine
   Portierungszeile.
4. **Die Prüfkosten sind nicht klein.** Der Spike hält fest: der Offline-Test muss gegen den
   **Prod-Build** laufen (unter `next dev` variieren die Chunk-URLs, der Cache greift nicht, die
   Hydration bleibt aus), mit **clientseitiger Interaktion** („Seite lädt offline" ist als Zusage
   wertlos), in einer eigenen `playwright.pwa.config.ts` mit `channel: "chromium"` — der
   Playwright-Standard-Browser ignoriert `--unsafely-treat-insecure-origin-as-secure` stillschweigend
   (`docs/spikes/2026-07-19-qr-offline-pwa.md`).
5. ⚠️ **Die fachliche Vorbedingung ist unbeantwortet.** Ob im Lagerraum und in der Fahrzeughalle Netz
   anliegt, ist eine offene Betreiberfrage (§15). **Annahme für diese Spec: es liegt Netz an** (WLAN
   oder Mobilfunk). Ist das falsch, ist die Antwort nicht ein Service Worker, sondern ein Access
   Point — weil Punkt 3 gilt.

#### 7.10.2 Was stattdessen gebaut wird: das PWA-Muster der Suite, unverändert

Das Muster steht seit dem 19.07.2026 fest: **Manifest, Icon und (falls je nötig) Service Worker als
Route Handler unter dem Modul**, nicht in `app/` oder `public/` (§2.7). Der Browser sieht sie auf
Root-Pfaden des Modul-Hosts, auf jedem anderen Host rewritet derselbe Pfad in *dessen* Modul und läuft
ins Leere.

| Datei | extern (Browser sieht) | intern |
|---|---|---|
| `src/app/m/lagerbuch/manifest.webmanifest/route.ts` | `lagerbuch.iuk-ue.de/manifest.webmanifest` | `/m/lagerbuch/manifest.webmanifest` |
| `src/app/m/lagerbuch/pwa-icon.svg/route.ts` | `/pwa-icon.svg` | `/m/lagerbuch/pwa-icon.svg` |
| `src/app/m/lagerbuch/icon-192.png/route.ts` | `/icon-192.png` | `/m/lagerbuch/icon-192.png` |
| `src/app/m/lagerbuch/icon-512.png/route.ts` | `/icon-512.png` | `/m/lagerbuch/icon-512.png` |
| `src/app/m/lagerbuch/icon-maskable-512.png/route.ts` | `/icon-maskable-512.png` | `/m/lagerbuch/icon-maskable-512.png` |

**Alle fünf tragen `lagerbuchHostOderNull` als erste Anweisung** (§2.6) — sonst bewirbt jeder
Suite-Host eine Lagerbuch-PWA.

**Die drei PNGs wandern aus `public/` heraus, und das ist kein Aufräumen, sondern eine Reparatur.**
`src/proxy.ts:103` schließt vom Matcher nur `_next/static|_next/image|favicon.ico` aus; `/icon-192.png`
wird auf dem lagerbuch-Host also nach `/m/lagerbuch/icon-192.png` umgeschrieben und läuft ins 404 —
während dieselbe Datei auf **jedem anderen** Host an der Wurzel ausgeliefert würde (Falle 56).

**Die Route Handler halten die Bytes als Base64-Konstante** und antworten mit
`Content-Type: image/png` und `Cache-Control: public, max-age=604800, immutable`. Das ist die
langweilige Variante — und sie beantwortet die offene Frage aus Falle 56 („greift Nexts
Dateikonvention `icon.svg`/`apple-icon.png` unter `/m/<key>/`?") dadurch, dass sie sie nicht stellt.
`qr` hat die Konvention aus demselben Grund umgangen (`m/qr/pwa-icon.svg/route.ts`).

**`<link rel="manifest">` kommt aus dem MODUL-Layout**, nicht aus dem Root-Layout (§7.1.1). Heute
steht `manifest: "/manifest.webmanifest"` in lagerbuchs Root-Layout (`layout.tsx:28`); dort würde es
in der Suite **jeder** Host bewerben.

**Der Manifest-Inhalt bleibt zeichengleich** — 1:1-Pflicht, weil diese Werte auf jedem Helfer-Handy,
auf dem lagerbuch auf dem Startbildschirm liegt, Symbol, Splash-Farbe und Startziel bestimmen und beim
Installieren eingebrannt werden (`lagerbuch/src/app/manifest.webmanifest/route.ts:14-28`):

```
name          "<APP_NAME> · <APP_ORG>"      short_name  "<APP_NAME>"
display       "standalone"                  start_url   "/"
theme_color   "#C8000F"                     background_color  "#EEF0F1"
icons         svg any · 192 · 512 · 512 maskable
```

⚠️ Die drei Textwerte kommen ab jetzt aus `_lib/marke.ts` (`LAGERBUCH_MARKE`,
`LAGERBUCH_ORGANISATION`, `LAGERBUCH_ZEILE`), nicht aus Env-Variablen (§10.2).

**`start_url: "/"` und `scope: "/"` bleiben richtig** — der Browser sieht den externen Modul-Host, der
Rewrite ist serverintern unsichtbar. Bedingung: `SUITE_HOST_LAGERBUCH` ist gesetzt. Ist es das nicht,
zeigt `start_url: "/"` auf das Portal, und eine installierte PWA startet im falschen Modul.
→ **Runbook-Schritt:** nach dem Umschwenken einmal `curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest`
und den Inhalt gegen die Tabelle halten; und `curl -si https://<portal-host>/manifest.webmanifest`
muss etwas anderes oder nichts liefern.

#### 7.10.3 Was passiert, wenn das Netz mitten im Ablauf weggeht

Ohne Service Worker ist die Antwort einfach und ehrlich, und sie ist in §7.3 als Zustand geführt:

| Moment | Verhalten |
|---|---|
| Beim Seitenaufruf | Die Fehlerseite des Browsers. Kein Modulzustand geht verloren, weil noch keiner besteht. |
| Beim Antippen von „Entnahme buchen" | `catch` → `grund: "netz"` → „Keine Verbindung. Die Buchung wurde **nicht** gespeichert." Die Menge bleibt im Feld, der Knopf wird wieder aktiv. |
| Beim Antippen von „Abschließen" im Check | `catch` → „Keine Verbindung. Der Check wurde **nicht** gespeichert — nichts ist verloren, bitte erneut auf Abschließen tippen." **Alle sechs Client-Zustände bleiben stehen.** |
| Während des Zählens (kein Netz nötig) | nichts. Der Zählschritt ist reiner Client-Zustand und läuft ohne Netz weiter. |

Der letzte Punkt ist die einzige „Offline-Fähigkeit", die dieses Modul zusagt — und sie ist echt: wer
mit der Seite im Fahrzeug steht und dort kein Netz hat, kann zählen und muss zum Abschließen einmal
wieder in Reichweite kommen. **Das gehört in die Übergabe an die Helfer, nicht ins Kleingedruckte.**

#### 7.10.4 ⚠️ Installierte PWA und Systemkamera sind zwei Welten — ein Prüfpunkt für die Generalprobe

Die Systemkamera öffnet einen gescannten QR im **Standardbrowser**, nicht in der installierten PWA.
Auf iOS führt ein zum Startbildschirm hinzugefügtes Web-App-Fenster eine **eigene** Speicherpartition;
ein `helfer_session`-Cookie, das im Browser gesetzt wurde, ist in der PWA nicht sichtbar und umgekehrt.
Praktische Folge: wer die PWA installiert hat und ein Regaletikett scannt, landet im Browser und muss
dort ein zweites Mal einlösen.

**Das ist nicht im Repo belegbar und wird hier auch nicht behauptet** — es ist Browserverhalten, das
sich zwischen Versionen ändert. → **Prüfpunkt für die Generalprobe:** ein Gerät, PWA installiert, im
Browser eingelöst, dann ein Regaletikett mit der Systemkamera scannen und notieren, ob eine Sitzung da
ist. Fällt der Test negativ aus, ist die Abhilfe keine Codeänderung, sondern ein Satz in der Übergabe:
„Entweder die App vom Startbildschirm benutzen **oder** über die Kamera — nicht gemischt."
Die Inline-Erneuerung aus §7.4.4 macht den Fall in jedem Fall erträglich.

---

### 7.11 Verworfene Alternativen

Die vollständige Liste steht in §13; hier die, die ausschließlich den Helfer-Weg betreffen.

| Verworfen | Warum |
|---|---|
| **`full`-Shell für `/helfer/*`, Tab-Leiste als `SuiteNavItem[]`** | 96px Überlauf gegen `100dvh` (Falle 41): die Tab-Leiste verschwindet unter dem Bildschirmrand, und damit die Umschaltung zwischen Entnahme und Fahrzeug-Check. Der Weg wäre erst nach einem `core`-Umbau von `FullShell` gangbar |
| **`kiosk`-Shell für `/helfer/*`** | `core/theme/KioskThemeProvider.tsx:27,29` hebt `fontSize` auf 20 und `controlHeight` auf `TAP_XL` = 72 — für Wandmonitore (`core/shell/Shell.tsx:30-31`: „Vollbild ohne Bedienelemente"). Auf 390px bleibt nichts |
| **Neue `core`-Shell-Variante `mobil`** | Die `core`-Regel verlangt einen zweiten, **heute belegbaren** Nutznießer (`docs/design/README.md`). Den gibt es nicht. Ein Framework für einen Nutzer ist teurer als die Verdopplung, die es verhindern soll |
| **Verfallsfeld bei 13px belassen, `feldschrift.test.ts` per Ausnahme beruhigen** | Die 16px-Untergrenze und der gesperrte Zoom sind **eine** Regel. Eine Ausnahme im einzigen Feld, das der Riegel überhaupt fängt, wäre die Ausnahme genau an der Stelle, an der die Regel greift |
| **Verfallsfeld auf antd-`DatePicker picker="month"`** | Bräche die Klassenentscheidung §7.1, brächte Dayjs-Umrechnung an die Servergrenze, ersetzt eine native Monatsauswahl durch ein 280px-Panel mit Zellrastern (mit Handschuhen), und schriebe einen der 28 E2E-Selektoren aus Falle 48 ohne Not um |
| **Stepper auf `InputNumber` in einem `Form.Item`** | Baut die dritte Zustandsquelle auf, die `Stepper.tsx:24-28` bewusst aufgelöst hat — in einem Feld, dessen falscher Wert eine falsche Bestandsbuchung ist (Falle 45). Und `noText` (`:19-21`) hat kein Gegenstück |
| **Service Worker nach dem qr-Muster mit Denylist für `/verwaltung`** | Die Denylist ist genau der Mechanismus, der bei `qr` versagt hat: die sensiblen Daten liegen auf `/helfer`, nicht hinter einem Präfix, und die RSC-Antwort `/helfer?_rsc=<hash>` trägt dieselben Daten. Ein Cache-Zweig müsste Allowlist sein und dürfte nichts Angemeldetes enthalten — dann cacht er das Gate, und das nützt niemandem |
| **Offline-Warteschlange für Buchungen** | Eigenes Vorhaben. Eine Entnahme ist eine FEFO-Abbuchung gegen einen gemeinsamen Bestand; eine Warteschlange braucht Konfliktauflösung, Rückmeldung nach dem Fakt und einen Weg, eine abgelehnte Buchung dem Menschen zuzuordnen, der sie ausgelöst hat. Nicht in einer Portierung |
| **Cookie-Namen auf `lb_helfer` präfixen** | Macht jede laufende Helfer-Sitzung ungültig und hebt damit den Zweck der Geheimnis-Übernahme (Betreiber-Entscheidung 4) auf. Ohne `domain` kauft der Präfix nichts (§3.4.2) |
| **Sitzungs-JWT um `jti`/`iss`/`aud` erweitern** | Dieselbe Wirkung: `verifyHelferSitzung` würde die Altcookies weiter akzeptieren, aber jedes neue Feld verführt zur Pflichtprüfung, und dann fallen die Altsitzungen. Falle 20 bleibt als benannter Restzustand stehen |
| **`redirect()` statt Rendern bei genau einem aktiven Fahrzeug** | Eine zusätzliche Anfrage, und ein geschriebener Pfad mehr, der äußer/inner verwechselt werden kann. Das Rendern kostet nichts |
| **Globale Sperre nach N Fehlversuchen (statt eines Eimers)** | Wäre ein Denial-of-Service-Hebel: ein Angreifer sperrt mit zwanzig Fehlversuchen den Gate-Zugang für alle Helfer einer Bereitschaft. Genau deshalb zählen die modulweiten Eimer **nur Fehlversuche** und liegen **hinter** der Codeprüfung (§3.5.3) |

---

### 7.12 Testaufbau — wer welche Aussage besitzt

Die drei Ebenen und die suiteweiten Randbedingungen stehen in §12; hier die Aussagen dieses Kapitels.

#### 7.12.1 Vitest, reine Funktionen

| Aussage | Datei |
|---|---|
| `normalisiereCode`: `123456` → `123-456`, `123-456` → `123-456`, ` 123 456 ` → `123-456`, `abc` → `ABC` (unverändert, kein Bindestrich) | `_lib/code.test.ts` |
| `normalisiereBarcode`: roher Code getrimmt; `https://alt.example/g/SN-1` → `SN-1`; `…/g/SN%2F1` → `SN/1`; kein `/g/` → unverändert getrimmt | `_lib/barcode.test.ts` |
| `tokenZielPfad`: drei Zweige, wörtlich | `_lib/tokenZiel.test.ts` |
| `sanitizeReturnTo`: vier Ablehnungsgründe, inkl. `/\` und `:` | `_lib/returnTo.test.ts` |
| `helferCookieOptionen()` enthält **kein** `domain`, dazu `httpOnly`, `sameSite: "lax"`, `path: "/"`; `createHelferSitzung`/`verifyHelferSitzung`-Rundlauf und die Alt-Cookie-Verträglichkeit | `_lib/helferSitzung.test.ts` (§3.8.1) |
| Gate-Eimer: 5 pro Absender/Minute, 30 modulweit/Minute, 300 modulweit/Stunde, **alle drei nur bei Fehlversuchen**; 100 erfolgreiche Einlösungen in Folge schließen das Gate **nicht** | `_lib/gateSchranke.test.ts` (§3.8.1) |
| `verfallStatus`/`o2Status`: Schwellen unverändert | `_lib/domain/verfall.test.ts`, `_lib/domain/o2.test.ts` (§5.19.1) |

#### 7.12.2 Vitest, Quelltext-Scans — sie besitzen Regeln, nie Ergebnisse

Die kapitelübergreifende Liste steht in §3.8.2. Zusätzlich für den Helfer-Weg:

| Aussage | Warum ein Scan |
|---|---|
| `_ui/helfer.module.css` enthält **keine** `@media (max-width` | jsdom wertet Media Queries nicht aus |
| Kein `--ant-` in `_ui/*.module.css` und in keinem Inline-Style unter `_ui/` | Eine nicht auflösbare Variable ist gültiges CSS und fällt still auf transparent (Falle 2) |
| **Kein `font-size` unter 16 in `_ui/*.module.css`, auch in der `font:`-Kurzschreibweise** | `core/theme/feldschrift.test.ts:114-141` liest nur die Langform — diese Lücke wird für dieses Modul lokal geschlossen (§7.7.2) |
| Keine Datei unter `_ui/` importiert `@ant-design/icons` oder `antd` **außer** den Verwaltungsbausteinen | die Klassenentscheidung §7.1 wird sonst still unterlaufen; `core/shell/icons.test.ts:147-171` fängt nur die Icons |

#### 7.12.3 Vitest + jsdom, DOM-Verhalten — mit dem etablierten Harness

Es gibt ein etabliertes Harness, und es wird kein zweites erfunden: `src/app/m/qr/_lib/test-dom.tsx`
(§12.2).

| Aussage |
|---|
| Stepper: `−` unter `min` klemmt; Direkteingabe über `max` klemmt; leeres Feld committet **nicht** als 0; `noText` rendert kein `<input>` |
| Entnahme: `{ok:false, grund:"leer"}` rendert die **Fehler**form, nicht den grünen Chip — der Regressionstest gegen „Entnahme gebucht: 0 ×" |
| Entnahme: `{ok:true}` mit `gebucht < angefordert` rendert „3 von 5 gebucht" |
| Entnahme: geworfener Netzfehler rendert „Keine Verbindung", Menge bleibt im Feld, Knopf wieder aktiv |
| CheckFlow: adaptive Schrittfolge — Fahrzeug ohne Geräte hat drei Schritte, ohne Artikel zwei, ohne alles den Leerzustand |
| CheckFlow: Verfallsfeld erscheint nur in der **ersten** Zeile je Artikel |
| CheckFlow: nur **geänderte** Verfälle landen im Action-Aufruf (`verfallState` gegen `gemeldet`) |
| CheckFlow: `{ok:false, grund:"sitzung"}` zeigt das Erneuerungsfeld **und** hält alle sechs Zustände; `grund:"gesperrt"` zeigt es **nicht** |
| `HelferRahmen`: `aria-current="page"` genau einmal, am Tab aus der Prop |
| `Restzeit`: `warntInitial={true}` rendert den Hinweis „Dein Zugang läuft um HH:MM ab …" **mit der vom Server gelieferten Uhrzeit**; `warntInitial={false}` rendert ihn nicht — und die Insel formatiert **nie selbst** (kein `toLocaleTimeString`, kein `Intl` in der Datei; der Quelltext-Scan aus §3.8.2 deckt das nicht ab, dieser Test schon) |
| `Restzeit`: mit `vi.useFakeTimers()` über die 30-Minuten-Schwelle gefahren erscheint der Hinweis **ohne Navigation** — das ist die eigentliche Zusage aus §3.4.3 Punkt 1, und ein serverseitig gerechneter Schwellenwert bliebe ohne diesen Test grün |

#### 7.12.4 Playwright — was NUR ein echter Abruf belegen kann

Datei: `e2e/lagerbuch-helfer.spec.ts`, gegen `http://lagerbuch.localtest.me:3100`, mit
`devLogin(page, {host, groups})` für die Admin-Schritte (§12.6). Der Seed für die beiden Token-Codes
läuft als **eigener Schritt** in der `webServer.command`-Kette (§12.6, Punkt 4).

| Aussage | Warum nur E2E |
|---|---|
| `/t/<code>` setzt das Cookie und landet auf dem Ziel — auf dem **Modul-Host**, mit relativem `Location`, Status **303** | Der Mehrhost-Fall ist in Vitest nicht darstellbar; heute mockt `token-redeem.test.ts:3` die Basis-URL auf denselben Host wie der Testserver, der Bruch ist per Konstruktion unsichtbar (Falle 16). **Diese Route hat heute NULL E2E** (Falle 32) |
| `/t/<code>` mit `zielTyp=fahrzeug` landet auf `/helfer/check?fz=<id>` und der Check ist vorgewählt | dieselbe Naht |
| `/t/<code>` mit gesperrtem Code landet auf `/?grund=code` **und der Text steht auf der Seite** | Falle 60 — heute schreibt niemand den Parameter und niemand liest ihn |
| `aria-current="page"` an drei Einstiegen (§7.8.2 Punkt 5) | `usePathname`/Rewrite-Auflösung ist in Vitest strukturell nicht prüfbar |
| Der Modul-Host liefert `manifest.webmanifest` (200, `application/manifest+json`), das Portal **nicht** — anonym **und** eingeloggt | Der eingeloggte Durchlauf ist der wichtigere; ohne ihn bewiese der Test nur etwas über die Login-Seite (Spike) |
| `/icon-192.png` liefert 200 auf dem Modul-Host | Falle 56 — heute 404, und niemand prüft, ob die im Manifest genannten Pfade auflösen |
| Gesperrter Token wird an der Buchung abgewiesen — **mit deutschem Text**, nicht mit `/server-side exception/` | Das ist die umzuschreibende Zeile aus `lagerbuch/e2e/helfer-flow.spec.ts:56`; die Aussage bleibt, der Träger wechselt (§12.5) |
| Gesperrter Token wird ab jetzt auch **lesend** abgewiesen: sperren, dann `/helfer` aufrufen → Gate | Entscheidung 13 (b), neue Zusage, kein Vorgängertest |
| Entnahme über einen Code erscheint im Journal mit dem Token-Label als Quelle | 1:1 aus `helfer-flow.spec.ts:19-27`; die Selektoren wechseln den Träger (§12.3) |
| Fahrzeug-Check Ende zu Ende: wählen → zählen → nachfüllen → abschließen, und der Bestand hat sich um genau die bestätigte Menge verschoben | die Transaktion über vier Tabellen ist nur end-to-end sichtbar |
| Bei 390×844 **und** bei 1280×720: die Tab-Leiste ist sichtbar und die Seite scrollt **nicht** waagerecht | „Wer nur die Enden misst, prüft die Mitte nicht" — und `documentElement.scrollWidth` allein sieht einen 96px-Überlauf nicht (Falle 41) |

#### 7.12.5 Was `pnpm build`, `typecheck` und `lint` hier NICHT finden

Die vollständige Liste steht in §12.5. Für den Helfer-Weg besonders:

| Fehler | Warum kein Gate greift |
|---|---|
| `startsWith` statt Prop in einer Aktivmarkierung | typkorrekter String-Vergleich; am Bildschirm sieht eine fehlende Markierung nicht kaputt aus, sondern unaufmerksam |
| `--ant-*` im Inline-Style des Taschenlampenknopfs | gültiges CSS, still transparent |
| `domain` in `helferCookieOptionen` | Cookie-Attribute sind Laufzeitwerte; gegen einen Host verhält sich domain-weit wie host-only |
| Ein `font:`-Kurzschreibweise-Feld unter 16px | `core/theme/feldschrift.test.ts` liest nur die Langform |
| `revalidatePath` mit äußerem statt innerem Pfad | ein Pfad, der nichts trifft, wirft nicht |
| Ein Action-Aufruf ohne `catch` | typkorrekt; der Ausfall ist ein Netzereignis |
| **Ein `requireHelferSchreibend`-Ergebnis, das niemand auswertet** | Der Riegel gibt seit §3.4.4 zurück statt zu werfen — ein Wurf konnte nicht ignoriert werden, ein Rückgabewert schon. Das einzige Netz ist der E2E „gesperrter Token wird an der Buchung abgewiesen"; ein zweites gibt es nicht |
| Die Kamera überhaupt | in keinem Gate prüfbar; `e2e/bz-scan.spec.ts:10` und `e2e/geraete.spec.ts:8` erzeugen ihre Barcodes selbst und tippen sie manuell ein |

---

### 7.13 Schnittstellen und Runbook

#### 7.13.1 Boot-Prüfung

`assertProductionSecrets` (`lagerbuch/src/lib/config.ts:101-113`) hängt heute an
`lagerbuch/src/instrumentation.ts:6`. Der Ersatz ist `_lib/boot.ts`, eingehängt in `assertHostConfig`
(`core/bootstrap.ts:40-49`) neben `filesBootFehler()`. **Die vollständige, bedingte Prüfliste und die
Begründung für `env_file` statt `${VAR:?…}` stehen in §10.5 und §10.6.**

#### 7.13.2 Was dieses Kapitel von anderen braucht

| Braucht | Von |
|---|---|
| `getDb()` aus `_db/client.ts` (modul-eigener Opener mit `lb_falte`) und die 16 Tabellen | §4, §5.13.2 |
| `redeemToken(code, db)`, `fefoAbbuchung`, `umlagerung`, `korrekturAufLagerort`, `setzeVerfall`, `verfallFuerLagerort`, `artikelListe`, `artikelDetailHelfer`, `fahrzeugListe`, `sollFuerFahrzeug`, `geraeteFuerLagerort`, `o2FlaschenFuerLagerort`, `HANDLAGER_ID` | §4, §5 |
| `verfallStatus`, `o2Status`, `chargeText`, `ampelTon`, Ampel-Palette `_lib/ampel.ts` | §5.17, §6.6.2 (Entscheidung 30 — die Hexwerte) |
| `uhrzeit(d)` aus `_lib/zeit.ts` — „HH:MM" in `ZEITZONE`, die siebte Zonenfunktion; sie trägt die Restzeit-Anzeige des Helfer-Rahmens (§3.4.3 Punkt 1, §7.8.2) | §4.5 |
| Registry-Eintrag mit `requiresAuth: false` und `SUITE_ADMIN_GROUP_LAGERBUCH` | §2.3 |
| `requireLagerbuchHost`, `lagerbuchHostOderNull`, `requireHelferSitzung`, `requireHelferSchreibend`, `helferZugangOderNull`, `absenderAus`, die Gate-Schranke | §2.6, §3.4, §3.5 |
| Wie der Verwaltungsknopf auf dem Gate anmeldet | §3.6.6 |
| Der `nav`-Slot des Moduls (nur `/verwaltung/*`) und Entscheidung 31 | §2.10, §6.3 |
| `/verwaltung/geraete/scan`, `/verwaltung/bz/scan`, `/g/[code]` als Aufrufer von `_ui/BarcodeScanner.tsx` und `_lib/barcode.ts` | §6.2.2, §6.4.9, §8.1 |
| Migrationsverzeichnis, `MODULE_MIGRATIONS`, **COPY-Zeile im Dockerfile** | §2.2 |
| `SUITE_HOST_LAGERBUCH` für die gedruckten QR-Inhalte | §8.1 |

#### 7.13.3 Was dieses Kapitel für andere festlegt

| Legt fest | Für |
|---|---|
| `_lib/helferSitzung.ts` — `HELFER_COOKIE`, `HelferPayload`, **`HelferSitzung`** (Nutzlast + `laeuftAb` aus dem `exp`, §3.4.3), `createHelferSitzung`, `verifyHelferSitzung`, `helferCookieOptionen` | §4 (Token-Ausstellung), §6.2.2 Zeile 22 (Sperren in der Token-Verwaltung) |
| `_lib/code.ts#normalisiereCode`, `_lib/barcode.ts#normalisiereBarcode` | **auch der Cutover-Import** (§4.7, §4.8) |
| `_lib/tokenZiel.ts`, `_lib/returnTo.ts` | Gate, `/t/<code>`, Verwaltungs-Cordon |
| `_lib/actionTypen.ts#HelferErgebnis`, `#HelferGrund` | jede Helfer-Action, §11.5 |
| `_ui/HelferRahmen.tsx` (drei Pflicht-Props: `aktiv`, `sitzungsetikett`, `laeuftAb`), `_ui/Restzeit.tsx`, `_ui/helfer.module.css`, `_ui/ikonen.tsx`, `_ui/Stepper.tsx`, `_ui/BarcodeScanner.tsx` | §6.4.9 (Scanner), §6.5 (Ikonen — Union und Riegel) |
| `manifest.webmanifest`, `pwa-icon.svg`, drei PNG-Route-Handler, `metadata.manifest` im Modul-Layout | §2.1 f, §2.7 |
| **`src/app/m/lagerbuch/layout.tsx` rendert KEINE `Shell`** | §6.15, Auflage 1 (eingelöst in §6.1.2) |
| E2E `e2e/lagerbuch-helfer.spec.ts` und Seed-Schritt `e2e/seed-lagerbuch.ts` | §12.6 |

#### 7.13.4 Runbook-Eingaben aus diesem Kapitel

Sie stehen gesammelt in §14; die vier, die hier entstehen:

1. **Die heutige `APP_BASE_URL` im Wortlaut** — und die Bestätigung, dass `SUITE_HOST_LAGERBUCH`
   derselbe Host ist. Weicht er ab, überleben die Helfer-Sitzungen den Cutover **nicht** (§7.4.1).
2. **Nach dem Umschwenken:** `curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest` und
   `/icon-192.png` gegen §7.10.2 halten; `curl -si https://<portal-host>/manifest.webmanifest` darf
   das lagerbuch-Manifest **nicht** liefern.
3. **Generalprobe, ein Gerät:** PWA installieren, im Browser einlösen, Regaletikett mit der
   Systemkamera scannen — und notieren, ob eine Sitzung da ist (§7.10.4).
4. **Optional, nach dem Cutover:** die Alt-Domain weiterleiten lassen, sonst sterben außerhalb der
   Anwendung gedruckte `/g/<code>`-QR-Aufkleber (§7.6.2).
---

## 8. Gedruckte Artefakte, Kurzpfade und Tokens

Dieses Kapitel beschreibt die Verträge, die **nicht im Repository liegen, sondern auf Papier,
Klebefolie und laminierten Kärtchen im Fahrzeug**. Sie sind die einzige Klasse von Zusicherungen,
die ein Rollback nicht zurückholt: eine falsche Zeile in `.env` ist in zehn Sekunden korrigiert, ein
falsch bedrucktes Etikettenblatt kostet einen Bogen gekauftes Material und einen Gang durch alle
Fahrzeuge.

### 8.1 Jede URL-Form, die heute im Umlauf ist

Es gibt **fünf** Formen, und sie hängen unterschiedlich stark am Host. Die Beispiele benutzen
Platzhalterdaten; die Artikel-ID ist eine echte nanoid-Form (21 Zeichen, Alphabet `A-Za-z0-9_-`,
`src/db/schema.ts:2,4`, §4.7).

| # | Form | Beispiel | Träger | Host-gebunden? | Erzeuger (Beleg) |
|---|---|---|---|---|---|
| 1 | **Artikel-Regaletikett, QR** | `https://lagerbuch.iuk-ue.de/a/V1StGXR8_Z5jdHi6B-myT` | Klebeetikett am Regalfach | **ja, absolut** | `src/db/etiketten.ts:19` (`${base}/a/${a.id}`), `base` aus `config.appBaseUrl` (`:15`) |
| 2 | **Token-Kärtchen, QR** | `https://lagerbuch.iuk-ue.de/t/482-137` | laminiertes Kärtchen im Fahrzeug / am Regal | **ja, absolut** | `src/db/etiketten.ts:23` |
| 3 | **Token-Kärtchen, Klartext** | `482-137` | dasselbe Kärtchen, Zeile unter dem QR | **nein** | `EtikettenBogen.tsx:38` übergibt `t.code` als `sub`; der Einlöseweg `Gate.tsx:40` → `(gate)/actions.ts:20` → `token-redeem.ts:14` braucht **nirgends** einen Host |
| 4 | **Geräte-Barcode-Deep-Link** | `https://lagerbuch.iuk-ue.de/g/4012345678901` | Aufkleber am Gerät — **außerhalb der Anwendung gedruckt** | ja, absolut, aber siehe unten | Erzeugt die Anwendung **nicht** (`src/db/etiketten.ts:19,23` kennt nur `/a/` und `/t/`); gelesen wird er von `actions/geraete.ts:71-72` per `code.match(/\/g\/([^/?#]+)/)` |
| 5 | **Rückweg-Link nach Abweisung** | `/?returnTo=%2Fa%2FV1StGXR8_Z5jdHi6B-myT` | kein Artefakt, entsteht im Browser | nein, relativ | `src/app/a/[artikelId]/page.tsx:19`, `g/[code]/page.tsx:25` |

**Was auf dem Etikett steht — die Antwort ist asymmetrisch, und daran hängt der Preis eines
Domainwechsels.**

- **Das Artikel-Regaletikett trägt ausschließlich den QR.** `etikettenDaten` liefert zwar
  `{ id, name, fach, url, qr }` (`src/db/etiketten.ts:20`), gerendert werden aber nur
  `name` als Titel und `fach` als Unterzeile (`EtikettenBogen.tsx:37`); `url` wird der Komponente
  nicht einmal als Prop übergeben (`EtikettenBogen.tsx:5`). **Die URL existiert auf dem Papier
  ausschließlich als Pixelmuster.** Ein Domainwechsel macht jedes Regaletikett wertlos, und der
  Ausfall ist zusätzlich **still**: `a/[artikelId]/page.tsx:22-23` macht bei unbekannter ID einen
  `redirect("/helfer")` — keine Meldung, kein 404 (Falle 27; behoben in 8-C).
- **Das Token-Kärtchen trägt zwei Verträge mit verschiedener Host-Abhängigkeit.** Der QR ist
  host-gebunden, der Klartext-Code darunter ist es nicht. Ein Domainwechsel kostet hier nur den
  Komfort: die Helferin tippt `482-137` am Gate ein und ist drin.
- **Form 4 überlebt einen Domainwechsel teilweise**, weil `normalisiereBarcode` nur das
  **Pfadsegment** herausschneidet (§7.6.2, heute `actions/geraete.ts:71-72`, zeichengleich
  `actions/bz.ts:73-74`): in der App gescannt funktioniert der Aufkleber weiter, mit der Systemkamera
  geöffnet nicht.

**Entscheidung 8-A — Die Domain wird übernommen; die Etiketten bleiben gültig.**
`SUITE_HOST_LAGERBUCH=lagerbuch.iuk-ue.de` (Betreiber-Entscheidung 1). Das ist Entscheidung 16
Option (a) der Analyse und damit die Empfehlung. **Zwingend dazu**, sonst erreicht die Domain den
Container nie und der Boot bleibt trotzdem fehlerfrei: `SUITE_TRAEFIK_RULE` muss denselben Host
führen. ⚠️ **Runbook-Eingabe:** der exakte heutige Wert von `APP_BASE_URL` aus der produktiven
`stack.env` (mit Schema, ohne abschließenden Schrägstrich) ist im Repo nicht belegt — der Cutover
muss verifizieren, dass er zeichengleich `https://lagerbuch.iuk-ue.de` lautet. Weicht er ab, ist
**jeder gedruckte QR aus Form 1 und 2 auf den alten Wert gebrannt** und die Entscheidung fällt auf
Analyse-Option (b) zurück (alter Host als zweiter Eintrag in derselben Variablen — `prodHostsFor`
liefert eine Liste, `registry.ts:68` führt genau dieses Muster für `files` vor; §2.6 erlaubt ≥ 2
Hosts ausdrücklich). ⚠️ **Dieselbe Angabe entscheidet zugleich, ob die Helfer-Sitzungen den Cutover
überleben** (host-only Cookie, §7.4.1) — es ist eine Frage, zwei Folgen.

**Entscheidung 8-B — Woher der Etikettendruck seine Basis-URL nimmt: `moduleUrl("lagerbuch")`,
nicht `resolveHost`, nicht `APP_BASE_URL`.**
Das ist Entscheidung 17 Option (c) der Analyse und damit die Empfehlung. Begründung im Einzelnen:

- `resolveHost(headers)` (`core/routing.ts:37-41`) ist für den Druck das falsche Werkzeug: der Wert
  kommt aus `x-forwarded-host`, ist fälschbar und garantiert nicht den Modul-Host. Ein manipulierter
  Header würde einen ganzen Bogen Etiketten auf eine fremde Domain drucken — und der Fehler zeigte
  sich erst, wenn jemand ein geklebtes Etikett scannt.
- `APP_BASE_URL` als modul-eigene Env beizubehalten wäre eine **sechste Wahrheit** neben
  `SUITE_HOST_LAGERBUCH`, mit der Gefahr, dass beide auseinanderlaufen. Die Variable wird beim Port
  **ersatzlos gestrichen**; `src/lib/config.ts:33,71` entfallen (§10.2).
- `moduleUrl` (`core/shell/moduleUrl.ts:15-27`) liest über `prodHostsFor()` und damit aus
  `SUITE_HOST_LAGERBUCH` — dieselbe Wahrheit, die auch das Routing benutzt.

**Zwei ausgeschriebene Fehlerzustände, die es heute nicht geben kann und ab dem Port geben wird:**

1. **`moduleUrl` liefert `null`.** In `NODE_ENV=production` ohne konfigurierten Prod-Host gibt die
   Funktion `null` zurück (`moduleUrl.ts:19-21`). Heute ist das unmöglich, weil `config.ts:33`
   einen zod-Default (`http://localhost:3000`) trägt. **Vorschrift:** `etikettenDaten` wirft in
   diesem Fall, und die Etikettenseite zeigt statt eines Bogens eine Meldung:
   `„Etiketten können nicht gedruckt werden: für lagerbuch ist keine öffentliche Domain
   konfiguriert (SUITE_HOST_LAGERBUCH). Ohne sie trägt jeder QR-Code einen toten Link."`
   **Verboten** ist beides, was ohne diese Regel passiert: ein QR mit dem Text `null/a/<id>`, und ein
   stiller Rückfall auf einen relativen Pfad — ein relativer QR ist auf Papier bedeutungslos, sieht
   aber auf dem Bildschirm richtig aus.
2. **`SUITE_HOST_LAGERBUCH` trägt mehrere Hosts.** `moduleUrl` nimmt `prodHostsFor(mod)[0]`
   (`moduleUrl.ts:20`) — die **Reihenfolge** der Liste bestimmt also, welcher Host in die gedruckten
   Pixel wandert. Eine Umsortierung der Variablen ändert still jeden ab dann gedruckten Bogen,
   während die alten Etiketten weiter auf den früheren ersten Eintrag zeigen. **Vorschrift:** die
   Etikettenseite schreibt den verwendeten Host als Text über den Bogen
   (`„Alle QR-Codes zeigen auf https://lagerbuch.iuk-ue.de"`, Klasse `lb-nichtDrucken`), damit die
   Person vor dem Drucken sieht, was sie druckt. Das kostet eine Zeile und ist der einzige Weg, den
   Fehler vor dem Papier zu bemerken. ⚠️ **Runbook-Auflage:** die Reihenfolge in
   `SUITE_HOST_LAGERBUCH` darf nach dem ersten Etikettendruck nicht mehr geändert werden.

**Entscheidung 8-C — Das stille Regaletikett bekommt eine Stimme.** `a/[artikelId]/page.tsx:22-23`
leitet bei unbekannter ID wortlos auf `/helfer` um (Falle 27). Nach dem Port lautet der Weg:
`notFound()` ist hier **falsch** (die Suite-404 unter `src/app/not-found.tsx` spricht von „dieser
Suite" und hilft einer Helferin mit einem Etikett in der Hand nicht), stattdessen rendert die Seite
eine eigene Meldung im Helfer-Rahmen:
`„Dieses Etikett gehört zu keinem Artikel mehr. Bitte melde es der Verwaltung — der Aufkleber kann
weg."` Das ist Entscheidung 36, Option (a) (§2.9, §11.3), und es deckt Falle 27.

**Entscheidung 8-C2 — `/g/<code>` behält seinen Fehlerfall, aber nicht den 404 der Suite.**
`g/[code]/page.tsx:33` endet bei unbekanntem Barcode mit `notFound()`. Heute landet das auf der
eingebauten Next-Seite in einem nackten `<body>` (`layout.tsx:42`), nach dem Port auf
`src/app/not-found.tsx` — ohne Modul-Layout, mit Suite-Geist und dem Absatz „in dieser Suite … wende
dich an die Administration". Das ist eine **stille Zieländerung** und für die Zielgruppe falsch:
`/g/` erreicht ohnehin nur eine angemeldete verwaltende Person (`page.tsx:21-26` schickt jede
Nicht-Admin-Anfrage vorher weg), und die braucht keine Auskunft über die Suite, sondern über den
Barcode — samt dem gescannten Code zum Abgleich mit dem Typenschild. **Vorschrift:** `notFound()`
weicht einer Meldung im Verwaltungsrahmen — `„Zu diesem Barcode gibt es weder ein Gerät noch eine
Sauerstoff-Flasche."` — plus dem gescannten Code, einem Knopf „Noch einmal scannen"
(`/verwaltung/geraete/scan`) und einem Link auf die Geräteliste. Damit tragen `/a/` und `/g/`
erstmals denselben Fehlermodus, statt zwei gegenläufiger im selben Modul (Falle 27).

**„Verwaltungsrahmen" ist hier wörtlich zu lesen: `_ui/VerwaltungsRahmen.tsx`, also `Shell
variant="full"` samt `nav`.** §2.9 entscheidet das aus und begründet es; für dieses Kapitel zählen
zwei Folgen für den Bau. Erstens mountet die Datei den Rahmen **selbst** — sie liegt außerhalb jeder
Route-Group, `verwaltung/(arbeit)/layout.tsx` erreicht sie nicht (§2.1 c), und `VerwaltungsRahmen`
bekommt damit zwei Importeure wie bei `files` (`m/files/page.tsx:80` gegen
`m/files/(verwaltung)/layout.tsx:48`). Zweitens bleibt `g/[code]/page.tsx` dabei eine **Server
Component** (§11.6): der Zustand darf nur antd-Bausteine **ohne Compound-Zugriff** benutzen —
`Result`, `Card`, `Table`, `Tag` sind ausdrücklich gedeckt (`CLAUDE.md:11-13`), `Button` ebenfalls
(die Suite-404 benutzt ihn in einer Server Component, `not-found.tsx:1,57`), `Typography.Title` und
Geschwister ergeben HTTP 500 (Falle 1) —, und er importiert **kein** `@ant-design/icons`: dort wirft
schon der Import, `build` und Vitest bleiben grün (Falle 7). Symbole kommen aus `_ui/ikonen.tsx`
(§7.7.4), die Texte aus einem Modul ohne `"use client"` unter `_lib/` (§11.6). ⚠️ **Wie die Datei
feststellt, dass sie es mit einer verwaltenden Person zu tun hat, entscheidet dieses Kapitel
nicht** — das ist die Rollen-Weiche aus §2.1 c und §3.2.1. Hier steht nur, was der übrig bleibende
Zustand trägt.

⚠️ **Das ist die eine benannte Ausnahme im Verwaltungszweig** (§2.9): alle übrigen
Verwaltungs-Detailseiten mit unbekannter ID behalten die Suite-404 (§11.5, Zustand 16). Der
Unterschied ist, dass dort niemand mit einem gescannten Gegenstand in der Hand steht.

**Entscheidung 8-G — Die Absenderadresse des Gate-Rate-Limits.** Sie ist vollständig in **§3.5**
entschieden: `cf-connecting-ip` oder ein konstanter Sammelschlüssel, **nie `x-forwarded-for`**, und
`core/ratelimit.ts` bleibt unangetastet. Für dieses Kapitel zählt nur, **warum** die Frage hier
überhaupt auftaucht: ein sechsstelliger Ziffern-Code (§8.3) ist gegen Raten nur so stark wie die
Drosselung davor. Die Rechnung — bei N aktiven Codes rund 10⁶/N Versuche im Erwartungswert — und die
drei Zähler stehen in §3.5.3.

### 8.2 Wie die Kurzpfade in der Suite erhalten bleiben

**Die Zusage lautet: von außen ändert sich nichts.** `/a/<id>`, `/t/<code>` und `/g/<code>` bleiben
**einsegmentige Pfade an der Wurzel des Modul-Hosts**. Das ist Entscheidung 18 Option (a) der Analyse
und damit die Empfehlung; Option (b) — ein zusätzliches Präfix — macht jeden gedruckten QR sofort
tot und ist hiermit ausgeschlossen.

**Die Mechanik.** `decideRoute` (`core/routing.ts:47-79`) prüft zuerst `PASSTHROUGH`
(`:12`) — **keiner dieser Präfixe kollidiert mit `/a`, `/t`, `/g` oder `/abmelden`** (§3.4.4), geprüft über die
Präfix-Regel `pathname === p || pathname.startsWith(p + "/")` (`:50`). Danach löst `moduleForHost`
das Modul auf und schreibt um: `/a/<id>` → `/m/lagerbuch/a/<id>` (`:78`). Der Rewrite ist
serverintern; der Browser sieht weiter `https://lagerbuch.iuk-ue.de/a/<id>`. Die drei Ablageregeln
(nicht unter `src/app/`, nicht unter `api/health` oder `login`, `public/` bleibt leer) stehen in
§2.7.

**Entscheidung 8-D — `/t/[code]` leitet ausschließlich relativ, mit Status 303.**
Heute baut `t/[code]/route.ts:19` das Gate-Ziel als `new URL("/", config.appBaseUrl)` und `:30` das
Erfolgsziel als `new URL(ziel, config.appBaseUrl)`, und `:31` setzt das `helfer_session`-Cookie auf
genau diese Antwort (Falle 16). Weicht die konfigurierte Basis vom anfragenden Host ab, gilt das
Cookie für den einen Host und die Landung passiert auf dem anderen — die Helferin kommt **ohne
Sitzung** am Gate an, während der Code als benutzt markiert ist (`token-redeem.ts:16` schreibt
`lastUsedAt` vor dem Redirect) und damit nicht mehr löschbar (`loeschen.ts:89-99`).

**Der vollständige Handler samt Begründung steht in §7.2.3.** Für dieses Kapitel zählen drei Sätze:

- Der Handler nennt **überhaupt keinen Host** — er antwortet mit `new NextResponse(null, { status: 303,
  headers: { Location: ziel } })` und setzt das Cookie auf dieselbe Antwort.
- `NextResponse.redirect(new URL(ziel, req.url))` ist ausdrücklich **falsch**: `req.url` trägt nach
  dem Rewrite die **interne** Adresse (`m/files/_lib/hostRolle.ts:137-139`), und damit wäre Falle 16
  zeichengleich wieder da, nur mit einer anderen falschen Basis.
- `ziel` beginnt **immer** mit `/` (`_lib/tokenZiel.ts` liefert nur lokale Pfade, `sanitizeReturnTo`
  erzwingt es für den Query-Weg, §7.2.5), ein relatives `Location` ist nach RFC 7231 §7.1.2 zulässig,
  und der Browser löst es gegen den Host auf, den er tatsächlich aufgerufen hat.

Damit fallen drei Nebenwirkungen derselben Variablen ersatzlos weg (§7.2.3): `Secure` der
Helfer-Sitzung, der `__Secure-`-Präfix des Callback-Cookies, `AUTH_URL=${APP_BASE_URL}`.

**Was aus diesem Kapitel als Auflage an §2 geht:** der Registry-Eintrag von `lagerbuch` **muss**
`requiresAuth: false` tragen (§2.3). Eine Helferin mit laminiertem Kärtchen hat kein Konto; würde
`decideRoute` auf `/a/<id>` einen Login erzwingen, landete **jeder gedruckte QR** in Pocket ID.

### 8.3 Tokens: Alphabet, Länge, Kollision, Ablauf, Einlösung

**Der Bestand, 1:1-Pflicht.**

| Eigenschaft | Wert | Beleg |
|---|---|---|
| Alphabet | `0123456789` — nur Ziffern | `src/actions/tokens.ts:10` (`customAlphabet("0123456789", 6)`) |
| Länge | 6 Ziffern | ebenda |
| Gespeicherte Form | `NNN-NNN` — **der Bindestrich ist Teil des Wertes** | `tokens.ts:15` (`${d.slice(0,3)}-${d.slice(3)}`), Spalte `tokens.code` `UNIQUE` (`schema.ts:134`) |
| Coderaum | 10⁶ | folgt aus Alphabet × Länge |
| Kollisionsverhalten | 20 Ziehungen gegen **lebende** Zeilen, dann `throw new Error("Konnte keinen eindeutigen Code erzeugen")` | `tokens.ts:12-18` |
| **Ablauf** | **es gibt keinen** — kein `expiresAt`, kein `validUntil` | `schema.ts:132-147` |
| Widerruf | ausschließlich `tokens.aktiv` — und der wirkt ab jetzt auch lesend (§3.4.4) | `schema.ts:143`, `token-redeem.ts:15` |
| Einlösung | exakter Vergleich `eq(tokens.code, norm)` gegen die **normalisierte Eingabe** (§7.5.3) | `token-redeem.ts:13-14` |
| Mehrfachgebrauch | ausdrücklich beabsichtigt — kein Test behauptet Einmalgebrauch | `rateLimit.ts:1-3` („Codes sind physisch laminiert … sofort sperrbar") |
| Nebenwirkung der Einlösung | `lastUsedAt` wird gesetzt; entscheidet **nicht** über Gültigkeit — und seit Entscheidung 8-F (unten) auch nicht mehr über Löschbarkeit. Es bleibt ein **Anzeigefeld** mit genau einem Leser | `token-redeem.ts:16`, `TokenTable.tsx:67`; der heutige Löschzweig `loeschen.ts:89-99` entfällt mit 8-F |
| Landeziel | `artikel` → `/a/<zielId>`; `fahrzeug` → `/helfer/check?fz=<zielId>`; ohne Ziel → `/helfer` | `_lib/tokenZiel.ts`, §7.2.5 |
| Zielspalten | `ziel_typ`/`ziel_id`, polymorph, **ohne** Fremdschlüssel | `drizzle/0003_token_ziel.sql`, `schema.ts:141-142` |

**Entscheidung 8-E — `toUpperCase` ist kein Vertrag, die Bindestrich-Toleranz wird nachgerüstet.**
`toUpperCase()` (`token-redeem.ts:13`) ist auf einem reinen Ziffern-Alphabet wirkungslos; es
beschreibt eine Absicht, die der Code nie eingelöst hat. `/t/482137` — der Code ohne Bindestrich —
löst heute **nicht** auf, weil der Vergleich exakt ist. **Die Funktion heißt `normalisiereCode` und
liegt in `_lib/code.ts`** (§7.5.3); sie bringt die **Eingabe** auf die Erzeugerform und kann damit
nur Treffer **hinzufügen**, nie einen bestehenden verlieren. Angewandt an allen **drei**
Gate-Flächen (`/t/<code>`, `einloesenAmGate`, `erneuereSitzung`), nie in der Erzeugung.

Denselben Umgang bekommt `/g/[code]`: `page.tsx:29,31` reicht das Routensegment heute roh durch,
während der Schreibweg trimmt (`actions/geraete.ts:17`, `actions/bz.ts:15`) und der andere Leseweg
ebenfalls (`db/geraete.ts:70`) — Falle 29. **Vorschrift: `normalisiereBarcode` auch auf dem
Routenweg** (§7.6.2). Auch hier gilt: Trimmen kann nur Treffer hinzufügen.

**Entscheidung 8-F — Der Code-Namensraum wird gegen Wiederverwendung gesperrt: der Hard-Delete
fällt.** Das ist Entscheidung 19 Option (a) der Analyse („die billigste Variante", Empfehlung).
`pruefeToken` (`loeschen.ts:89-99`) erlaubt das harte Löschen, solange `lastUsedAt` null ist;
`generateUniqueCode` prüft Kollisionen nur gegen lebende Zeilen (`tokens.ts:16`). Zusammen kann ein
gedrucktes, nie eingelöstes Kärtchen seinen Code an ein später ausgestelltes verlieren — und weil
`tokens.code` zugleich der Anzeigeschlüssel im Journal ist (1:1-Pflicht 6, `quelle.ts:20,23`),
erschienen historische Zeilen danach unter dem **neuen** Label. Nach dem Port kann ein Token nur noch
**gesperrt** werden (`aktiv = false`); der Code bleibt für immer belegt. Das passt zum
append-only-Geist des Journals (§4.4) und berührt das Schema **nicht** — Option (b) mit einer
`verbrauchte_codes`-Tabelle wäre teurer ohne Zusatznutzen.

**Diese Entscheidung fällt hier und nur hier — und sie zieht `last_used_at` eine Aufgabe ab, die
fünf andere Stellen ihm noch zuschrieben; nachgezogen ist sie in sechs Abschnitten.** Konkret entfallen `pruefeToken` (`loeschen.ts:89-99`)
und der Zweig `case "token"` in `loescheElement` (`:168`) ersatzlos; gesperrt wird über `aktiv`
(`tokens.ts:57`). Damit ist `NULL` in `last_used_at` **kein Löschbarkeitsschalter mehr**, sondern
nur noch die Auskunft „nie benutzt" — mit genau einem Leser, `TokenTable.tsx:67`. Nachgezogen ist
das in §2.6, §3.2.2, §3.4.6 Punkt 5, §4.5 (Zeile 8), §4.12 und §5.21. ⚠️ **Zwei Dinge ändert 8-F
ausdrücklich nicht:** `last_used_at` wandert beim Import weiterhin **vollständig** mit (§4.12,
1:1-Pflicht 5) — ein Anzeigewert, den man nicht überträgt, ist unwiederbringlich weg —, und der
Hard-Delete der übrigen Objektarten bleibt (§5.21). 8-F ist eine Ausnahme für **Tokens**, keine neue
Regel für das Modul. Die exportierte Oberfläche von `loeschen.ts` bleibt unverändert
(`pruefeLoeschbar`, `loescheElement`, `deaktiviereElement`); die Zahl der Actions ändert sich nicht.

### 8.4 Das Etikettendruckstück

**Die Geometrie ist 1:1-Pflicht 22 und wird zeichengleich übernommen** — sie ist auf gekaufte
Standard-Klebeetikettenbogen abgestimmt, und jeder Fehlversuch verbraucht ein Blatt:

| Größe | Wert | Beleg |
|---|---|---|
| Etikett | `48.5mm × 25.4mm` | `src/app/globals.css:266` |
| Raster | `grid-template-columns: repeat(auto-fill, 48.5mm)` | `:265` |
| Abstand **Bildschirm** | `gap: 2mm` | `:265` |
| Abstand **Druck** | `gap: 0` | `:279` |
| QR-Bild | `20mm × 20mm` | `:268` |
| Innenabstand / Spalt | `padding: 2mm`, `gap: 2.5mm` | `:266` |
| Seitenrand | `@page { margin: 8mm }` | `:276` |
| Abgewählt, Bildschirm | `opacity: .35` | `:267` |
| Abgewählt, **Druck** | `display: none !important` | `:281` |
| Titelzeile | `font: 700 11px`, einzeilig mit Ellipse | `:271` |
| Unterzeile | `font: 600 9px`, monospace | `:272` |

**Der `gap`-Unterschied zwischen Bildschirm und Druck ist die heikelste Zeile der Tabelle:** wer nur
die Bildschirmansicht portiert, übernimmt das falsche Raster und merkt es erst am Drucker.

**Entscheidung 8-H — Der Bogen bekommt eine eigene Route-Gruppe `(druck)` ohne Suite-Shell, mit dem
Admin-Riegel als aufrufbarer Funktion im Layout.** Das ist Entscheidung 20 Option (a) der Analyse.
Die Analyse gibt dort **keine** Empfehlung ab, sondern nennt eine Auflage („wenn (a), dann mit dem
Riegel als aufrufbarer Funktion") — diese Entscheidung erfüllt sie. Die Begründung, warum Option
(b) hier **nicht** verfügbar ist, ist neu und tragend:

- Das `files`-Muster löst den Druck über
  `.druckbereich { position: fixed; inset: 0; overflow: hidden }`
  (`src/app/m/files/_ui/zugangslinks.module.css:148-153`). Das funktioniert dort, weil **eine** Karte
  gedruckt wird. Der Etikettenbogen ist N Etiketten ohne Obergrenze (`etikettenDaten` filtert nur auf
  `aktiv`, `src/db/etiketten.ts:16-17`); bei `@page{margin:8mm}` passen rund 40 Etiketten
  auf ein A4-Blatt. **Mehrseitigkeit ist der Regelfall, nicht der Randfall** — und
  `position: fixed` mit `overflow: hidden` schneidet alles ab Seite zwei ab, still, auf gekauftem
  Material.
- Der Vorwurf gegen Option (a) — die Druckansicht fällt aus dem Zugriffsriegel — ist im
  `feedback`-Modul bereits **repariert und dokumentiert**: `src/app/m/feedback/(print)/layout.tsx`
  ruft `requireFeedbackAccess()` im Druck-Layout, mit ausgeschriebener Begründung („mit dem
  `(admin)`-Layout fällt auch dessen Auth-Riegel weg"). lagerbuch übernimmt genau dieses Muster.
  **Zwei Linien sind Pflicht**, weil `requiresAuth: false` gilt und die Middleware hier nicht gatet:
  der Riegel im `(druck)`-Layout **und** derselbe Riegel in der Seite.

**Der Dateibaum — und die Pfadfrage, die eine Route-Gruppe sonst still beantwortet.**
Route-Gruppen erscheinen **nicht** in der URL. Ein naiv angelegtes
`src/app/m/lagerbuch/(druck)/etiketten/page.tsx` löste zu `https://lagerbuch.iuk-ue.de/etiketten`
auf — heute ist der Bogen unter `/verwaltung/etiketten` erreichbar
(`src/app/verwaltung/(admin)/etiketten/page.tsx`, verlinkt aus `SideNav.tsx`).

**Entscheidung 8-H2 — Der öffentliche Pfad bleibt `/verwaltung/etiketten`.** Er ist zwar kein
gedrucktes Artefakt, steht aber in Lesezeichen und in der Navigation; ihn nebenbei zu verschieben
wäre genau die Sorte stiller Änderung, die dieses Kapitel sonst verhindert. Die Gruppe liegt
deshalb **unter** `verwaltung` (vollständiger Baum in §2.1):

```
src/app/m/lagerbuch/verwaltung/
  (arbeit)/layout.tsx             ← requireLagerbuchHost + requireLagerbuchAdmin + Shell full + nav
  (arbeit)/artikel/page.tsx       ← usw., 23 Seiten (§6.2.2)
  (druck)/layout.tsx              ← requireLagerbuchHost + requireLagerbuchAdmin; rendert {children}, KEINE Shell
  (druck)/druck.css               ← @page + @media print, gilt NUR fuer diesen Ast
  (druck)/etiketten/page.tsx      ← Server Component: laedt Daten, erzeugt QR   → /verwaltung/etiketten
  (druck)/etiketten/EtikettenBogen.tsx  ← "use client": Auswahl-State + window.print()
src/app/m/lagerbuch/_lib/etikettMasse.ts   ← die Millimeterwerte, ohne "use client"
src/app/m/lagerbuch/_db/etiketten.ts       ← etikettenDaten(db)
```

**Zwei Bedingungen, ohne die dieser Baum nicht trägt** (beide als Auflage in §6.15, Nr. 1 und 2;
eingelöst in §6.1.2 und §6.2.2):

1. **Es darf kein `verwaltung/(arbeit)/etiketten/` geben.** Zwei Route-Gruppen dürfen denselben
   aufgelösten Pfad nicht doppelt belegen — dieselbe Einschränkung, die
   `src/app/m/feedback/(print)/layout.tsx` in ihrem Kopf ausschreibt.
2. **Weder `src/app/m/lagerbuch/layout.tsx` noch ein `verwaltung/layout.tsx` darf die Shell mounten.**
   Ein Layout ohne Gruppenklammer ist Vorfahr **aller** Kinder, auch der Gruppe `(druck)` — die Shell
   wäre dann wieder da, und die ganze Entscheidung liefe leer. Die Shell gehört ausschließlich in
   `(arbeit)/layout.tsx` (§2.9).

**Was in keiner Variante bleiben darf:** `body * { visibility: hidden }`
(`src/app/globals.css:277`). CSS Modules schreiben ausschließlich **Klassen**selektoren um
— `body *` bliebe global und leerte jede andere Druckseite der Suite (feedback-Aushang,
files-Zugangslinks, Falle 43). Die Sichtbarkeitsumkehr wird ersatzlos durch die eigene Route-Gruppe
ersetzt: ohne Shell gibt es nichts auszublenden. Damit entfällt auch der zweite Teil des Problems —
`Layout{minHeight:100vh}` (`FullShell.tsx:19`) bliebe unter `visibility:hidden` im Fluss und erzeugte
leere Folgeseiten hinter dem Bogen.

**`druck.css` — die vier Blöcke, die nicht fehlen dürfen** (Vorbild
`src/app/m/feedback/(print)/druck.css:20-40`, dort mit derselben Begründung). ⚠️ **Diese Datei ist
der einzige Ort des Moduls mit `@media print`** — §6.10.2 hält die Regel dazu (nur Klassenselektoren,
kein `body *`) und den Scan, der sie bewacht; der Scan muss `.css` und nicht nur `.module.css`
lesen, sonst lässt er ausgerechnet diese Datei aus:

```css
/* Alle Klassen tragen das Praefix `lb-`: druck.css ist ein GEWOEHNLICHES
   Stylesheet, kein CSS-Modul — die Namen sind global. `feedback` praefixt aus
   demselben Grund (`.fb-aushang-*`); dass `files` mit `.nichtDrucken` durchkommt,
   liegt allein daran, dass dort die Klassennamen gehasht werden. */

@page { margin: 8mm; }                    /* 1:1 aus globals.css:276 */

@media print {
  .lb-nichtDrucken { display: none; }
  body {
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;            /* sonst schluckt der Browser Flaechen */
  }
  .lb-etikettbogen { gap: 0; }            /* Bildschirm 2mm, Papier 0 — globals.css:279 */
  .lb-etikettAbgewaehlt { display: none; }/* nicht opacity — globals.css:281 */
}

/* EIN BLATT PAPIER HAT KEINEN DUNKELMODUS — und die Werte sind LITERALE,
   kein `--ant-*`: antd deklariert seine Variablen auf der Scope-Klasse SEINER
   Komponenten (Falle 2), auf eigenem Markup waeren sie still leer. Genau deshalb
   kann der Dunkelmodus-Schutz hier kein Token sein. */
.lb-etikettbogen { background: #fff; color: #000; }
```

**Der Dunkelmodus ist ein neuer Fehlermodus, den lagerbuch heute nicht haben kann.** Die
Alt-Anwendung hat nur ein helles Thema; die Suite schaltet über `<html data-theme>`. Ohne die feste
Festlegung auf `#fff`/`#000` druckt ein Bogen aus einer dunkel eingestellten Sitzung weiße Schrift auf
weißes Papier, und `print-color-adjust: exact` verbietet dem Browser jede Notrechnung — es käme nur
der QR-Kasten heraus. Das ist zeichengleich das Problem, das `feedback` in `druck.css:42-61` für den
Aushang gelöst hat.

**Entscheidung 8-I — Der QR kommt aus `core/qr`, als SVG, mit einer benannten Abnahmeprüfung auf
Papier.** Die Alt-Anwendung erzeugt `QRCode.toDataURL(text, { margin: 1, width: 200 })`
(`src/db/etiketten.ts:11`) — das sind die Bibliotheks-Vorgaben Level **M** und ein Ruhezonenrand von
**1** Modul. Die Suite hat seit dem `qr`-Modul **eine** Konfiguration für alle QR-Codes: Level **H**,
`margin: 4` (`core/qr/index.ts:24-28`, mit ausgeschriebener Begründung „Vorher gab es drei
divergierende Stellen … Jetzt gilt überall dieselbe Konfiguration").

Das ist **keine** kosmetische Differenz, weil 1:1-Pflicht 22 die Bildkante bei 20mm festnagelt und
man sich nicht durch Vergrößerung freikaufen kann:

| | Nutzlast ~52 Byte | Version | Module + Ruhezone | mm je Modul bei 20mm |
|---|---|---|---|---|
| heute (M, margin 1) | `https://lagerbuch.iuk-ue.de/a/<21 Zeichen>` | 3–4 | ca. 33 + 2 = 35 | ca. 0,57 |
| `core/qr` (H, margin 4) | dieselbe | 5–6 | ca. 41 + 8 = 49 | ca. 0,41 |

**Vorschrift:** `core/qr` wird benutzt, unverändert — eine zweite QR-Konfiguration im Projekt ist
genau das, was `core/qr/index.ts:19-23` abgeschafft hat, und Level H ist für ein laminiertes,
verschmutztes Kärtchen die bessere Wahl. **Die Abnahme ist physisch und nicht verhandelbar:** ein
Probebogen wird auf dem tatsächlich benutzten Drucker auf das tatsächlich gekaufte Etikettenmaterial
gedruckt und mit **zwei** Telefonen aus 15 cm gescannt — je fünf Etiketten aus der ersten und der
letzten Zeile des Bogens. **Benannter Rückfall, falls die Abnahme scheitert:** `core/qr` bekommt
einen optionalen `margin`-Parameter, der Etikettenbogen setzt ihn auf `1`, und die Ausnahme wird an
der Aufrufstelle mit dem Messergebnis begründet. Level H bleibt in beiden Fällen.

⚠️ **Annahme:** die ~52 Byte Nutzlast setzen `https://lagerbuch.iuk-ue.de` (27 Zeichen) plus
`/a/` plus 21 nanoid-Zeichen an. Ein deutlich längerer Host verschiebt die QR-Version nach oben und
die Module weiter nach unten — die Abnahmeprüfung fängt das ab, die Rechnung oben nicht.

**Zwei technische Folgen, die ein Bau-Task sonst übersieht:**

1. **`core/qr` liefert keine Data-URL — und liefert `async`.** `qrSvg(text)` ist eine
   `async`-Funktion und gibt ein **`Promise<string>`** zurück (`core/qr/index.ts:37-40`), `qrPng` ein
   `Promise<Uint8Array>` (`:42-46`). ⚠️ **Folge für `etikettenDaten(db)`: die Funktion wird selbst
   `async`** und erzeugt die Codes eines Bogens über **ein** `await Promise.all(...)`, nicht in einer
   Schleife mit vergessenem `await` — ein fehlendes `await` ergäbe hier keine Fehlermeldung, sondern
   `[object Promise]` als Markup. Sie liefert danach einen SVG-String je
   Etikett, kein `data:image/png`. Für den Druck ist das die bessere Form: Vektor statt 200px-Raster,
   also keine Auflösungsgrenze bei 20mm. Der SVG-String wird in der Client-Insel per
   `dangerouslySetInnerHTML` eingesetzt — dieselbe Stelle und dieselbe Begründung wie
   `src/app/m/qr/QrDisplay.tsx:16-21`: das Markup stammt aus dem SVG-Serializer von `qrcode`, die
   Nutzlast landet als Modulkoordinaten im `d`-Attribut, nie als Text im Markup.
2. **Das `qrcode`-SVG bringt nur eine `viewBox` mit, keine Breite/Höhe.** `globals.css:25-28` fängt
   das heute nur für `[data-testid="qr-display"] > svg` ab. Der Etikettenbogen braucht seine eigene
   Regel im Modul-CSS: `.lb-etikettQr > svg { display: block; width: 20mm; height: 20mm; }` — sonst
   fällt der Code auf die Ersatzgröße des Browsers zurück und wird winzig, **ohne dass ein Test
   anschlägt**.

**Was der antd-Umbau am Druckstück ändert — und die Fallen, die er dabei aufstellt.**

- **Falle 7 (`@ant-design/icons` in RSC ergibt HTTP 500).** `EtikettenBogen` ist bereits eine
  Client-Insel (`"use client"`, `EtikettenBogen.tsx:1`), das Drucker-Icon
  (`Printer` aus `lucide-react`, `:3,34`) darf dort durch ein antd-Icon ersetzt werden. **Die Seite
  daneben (`(druck)/etiketten/page.tsx`) ist eine Server Component und darf kein einziges Icon
  importieren** — auch kein indirekt gezogenes. `src/core/shell/icons.test.ts` riegelt das repo-weit
  ab; geht der Test rot, liegt die Ursache in der genannten Datei, nicht in `core/shell`.
- **Falle 6 (Werte aus `"use client"`-Modulen).** Die Millimeterwerte, die Server- **und**
  Client-Seite kennen müssen (Etikettbreite, QR-Kante — sie sind Testgegenstand), gehören in
  `_lib/etikettMasse.ts` **ohne** `"use client"`. Ein `export const ETIKETT_BREITE_MM = 48.5` in
  `EtikettenBogen.tsx` erreicht eine Server Component nicht als Wert, sondern als Client-Referenz:
  HTTP 500 für die ganze Seite, `typecheck` und `build` grün, **und Vitest kann es strukturell
  nicht sehen**. ⚠️ Diese Datei hält **nur** die Werte, die beide Seiten brauchen —
  `_lib/grenzen.ts` hält bewusst keine Millimeter (§10.3).
- **Falle 1 (Compound-Zugriff in RSC).** Auf dem Druckast wird ohnehin fast kein antd gebraucht; wo
  doch, gilt die Regel: kein `Typography.Title`, kein `Form.Item` in einer Server Component.
- **Falle 5 (Spezifität) — die konkrete Bruchstelle.** `.etikett input, .no-print { display: none }`
  (`src/app/globals.css:282`) trifft heute das nackte `<input type="checkbox">`
  (`EtikettenBogen.tsx:19`). Ein antd-`Checkbox` rendert an dieser Stelle **kein nacktes `<input>`**
  auf der erwarteten Ebene, sondern eine `.ant-checkbox-wrapper`-Struktur. **Entschieden in §6.10.2,
  Punkt 1: die Auswahl bleibt ein eigenes `<input type="checkbox">`** — die Kachel ist ohnehin als
  Ganzes klickbar, das Kästchen ist Anzeige, und ein nacktes Kästchen mit `.lb-nichtDrucken` ist
  ehrlicher als ein antd-Baustein, den eine Druckregel wieder verstecken muss. **Falls doch ein
  antd-`Checkbox` gewählt wird, gilt:** `className="lb-nichtDrucken"` sitzt auf dem **Wrapper, den
  die Checkbox rendert** — **innerhalb** des `<label className="lb-etikett">`, nie auf dem Label. Auf
  dem Label säße die Regel auf dem ganzen Etikett und druckte ein leeres Blatt. Das Druck-CSS
  greift in **beiden** Fällen ausschließlich auf die eigene Klasse — nie auf `input`, nie auf
  `.ant-*`. Eine Regel gegen einen antd-internen Klassennamen wäre eine Kopplung, die ein
  antd-Major still bricht.
- **Falle 3 (`colorError === colorPrimary === #c8000f`).** Der Drucken-Knopf ist heute `btn-rot`
  (`EtikettenBogen.tsx:34`). Er bleibt die Primäraktion — das ist zulässig, weil er eine
  **Handlung** ist und keine Datenfläche. Rot darf im Etikettenbogen an keiner Stelle Bedeutung
  tragen.

**Was am Druckstück nicht geändert wird:** die Auswahl-Interaktion (Alle / Keine / Drucken mit
Zähler, `:32-34`), der leere Zustand (`„Keine aktiven Artikel oder Token."`, `:27`), und die
Tatsache, dass `etikettenDaten` hart auf `aktiv = true` filtert (`:16-17`). ⚠️ **Der letzte Punkt ist
bewusst 1:1 und trotzdem eine Lücke, die im Runbook stehen muss:** ein deaktivierter Artikel ist
unter `/a/<id>` **weiterhin vollständig bebuchbar** (`src/actions/session.ts:25-26` prüft
nur `tokens.aktiv`, `src/db/abbuchung.ts:36-49` liest ohne Aktiv-Bedingung), aber nie wieder
nachdruckbar (Falle 26). Die Menge der physisch hängenden Etiketten ist damit **echt größer** als
die Menge der heute druckbaren, und die Differenz ist im Repo nicht abzählbar.

### 8.5 Was der Etikettenweg an Tests schuldet

Der heutige Bestand trägt zwei Zusicherungen, die **keine** sind:

- `lagerbuch/e2e/etiketten.spec.ts:13` prüft `toHaveAttribute("src", /^data:image\/png/)` — der QR
  wird **nie dekodiert**. Ein Code mit falschem Inhalt bleibt grün.
- `lagerbuch/src/db/etiketten.test.ts:2` mockt `config` auf `https://lager.example` und assertiert
  genau den gemockten Wert. Das friert die Annahme ein, statt sie zu prüfen.

**Vorschrift:** ein Test, der **dekodiert**. Die Suite hat die Infrastruktur bereits —
`e2e/helpers/decode-qr.ts` (sharp + jsQR, `sharp` und `jsqr` liegen in `package.json:51-52`), mit
ausgeschriebener Begründung ab `:4-8`: „eine Zusicherung auf `<svg>`-Vorhandensein würde auch dann
grün bleiben, wenn der Code den falschen Inhalt trägt". Der Test erzeugt ein Etikett für eine
bekannte Artikel-ID, dekodiert das SVG und vergleicht gegen
`https://<aus SUITE_HOST_LAGERBUCH aufgelöster Host>/a/<id>` — den Host **aufgelöst**, nicht
gemockt. Das ist die einzige Konstruktion, die eine Regression der Basis-URL fangen kann. Kein
zweiter Dekodierer; wenn die Vitest-Konfiguration `e2e/helpers/` nicht auflöst, wandert der Helfer
nach `src/core/qr/decode.ts` — der zweite Nutznießer sind die bestehenden `qr`-E2E, die Hürde aus
`docs/design/README.md` ist damit genommen.

Dazu: **`moduleUrl` liefert `null` → der Bogen verweigert sich mit Meldung** (8-B), als eigener
Vitest — ein Zustand, den es heute nicht geben kann und der nach dem Port der wahrscheinlichste
Fehlstart ist.

⚠️ **Was kein Test leisten kann:** ob der Bogen auf Papier passt. `pnpm build` und Vitest sehen
`@media print` gar nicht, Playwright rendert per Vorgabe für den Bildschirm. Die Abnahme aus
Entscheidung 8-I (Probebogen, zwei Telefone) ist deshalb eine **Runbook-Zeile**, kein Test. Was
Vitest besitzt, ist ein **Quelltext-Scan** über `(druck)/druck.css`: `@page` und `.lb-nichtDrucken`
stehen da, `body *` **nicht** (Vorbild `files/_ui/ZugangslinksListe.test.tsx:608-614`) — er hält die
Aussage „die Regel steht da", nie „sie wirkt".

---

## 9. Ausgabeformate

Drei Wege verlassen das Modul als Datei oder als Text in der Zwischenablage. Alle drei sind
1:1-Pflicht (Analyse 1:1-Pflicht 28), **solange nicht belegt ist, dass niemand sie weiterverarbeitet**
— und dieser Beleg existiert nicht: Betreiberfrage 43 („in welchem Programm wird
`bestellvorschlag.csv` geöffnet?") gehörte **nicht** zu den acht am 03.08.2026 beantworteten Fragen.

**Ausgeschlossen ist alles Übrige, und das ist belegt** (Analyse 4.2, repoweite Suche über
`navigator.share`, `document.execCommand`, `mailto:`, `nodemailer`/`sendMail`, ausgehende `fetch`):
das Modul **verschickt nichts** und ruft kein fremdes System. Der Etikettenbogen (§8.4) und der
Datenbank-Snapshot (`lagerbuch-YYYYMMDD.db`, `src/db/backup.ts:8-9,24-27`) sind eigene
Gegenstände und hier nicht wiederholt (§10.7). Der CSV-**Import** ist ein Eingabevertrag und wird in
§9.5 ausdrücklich abgegrenzt.

### 9.1 Die Übersicht — und die eine Falle, die zwei Knöpfe nebeneinander stellen

Zwei der drei Wege sitzen als zwei Knöpfe auf **einem** Bildschirm
(`src/app/verwaltung/(admin)/bestellung/BestellListe.tsx:40-41`) und liefern **nicht
dieselben Zeilen**:

| Weg | Zeilenumfang | Beleg |
|---|---|---|
| `bestellvorschlag.csv` | **alle** Vorschlagszeilen, auch bereits als bestellt markierte | `BestellListe.tsx:30` — kein Filter |
| Zwischenablage | **nur die noch nicht bestellten** | `BestellListe.tsx:25` — `filter((z) => !z.bestellt)` |
| `bestand-YYYY-MM-DD.xlsx` | die **gefilterte und sortierte** Artikelansicht, nicht die Tabelle | `ArtikelTable.tsx:133` (`bestandExportZeilen(gefiltert)`), `:112-123` |

**Entscheidung 9-A — Die Zeilenumfänge bleiben verschieden, aber sie werden beschriftet.**
Eine stille Vereinheitlichung wäre eine Fachentscheidung im Gewand einer Aufräumarbeit — genau die
Klasse Änderung, die ein Neubau am leichtesten macht und am schwersten bemerkt. Der Umfang bleibt
zeichengleich; **geändert werden nur die beiden Knopfbeschriftungen**, weil sie heute nichts
verraten:

| Heute | Nach dem Port |
|---|---|
| `Liste kopieren` (`:40`) | `Liste kopieren (nur offene)` |
| `CSV` (`:41`) | `CSV (alle Zeilen)` |

Das ist keine Formatänderung und berührt keinen Vertrag mit der Außenwelt. **Geprüft:** kein E2E
und kein Unit-Test der Alt-Anwendung greift auf diese beiden Beschriftungen zu — eine Suche über
`lagerbuch/e2e/` nach `Liste kopieren` und `bestellvorschlag` liefert **keinen** Treffer; der einzige
Export-E2E ist `lagerbuch/e2e/bestand-export.spec.ts` und trifft über `/Excel-Liste/` (`:16`)
ausschließlich den Excel-Knopf, der unverändert bleibt.

### 9.2 `bestellvorschlag.csv` — spaltengenau

**Erzeuger:** `downloadCsv()` in `BestellListe.tsx:28-35`, gebaut im Browser, ausgeliefert über einen
Blob-Link (`:31-34`). Der Vertrag, Byte für Byte:

| Eigenschaft | Wert | Beleg |
|---|---|---|
| Spalten, in dieser Reihenfolge | `Artikel`, `Bestand`, `Mindestbestand`, `Vorschlag`, `Einheit`, `Status` | `:29` |
| Trennzeichen | **Semikolon**, nicht Komma | `:29-30`, beide `join(";")` |
| Quotierung | **jede** Zelle in `"`, enthaltene `"` verdoppelt — auch die Zahlenspalten | `csvCell`, `:8` |
| `Status`-Literale | genau `bestellt` bzw. `offen` | `:30` |
| Zeilentrenner | `\n`, **nicht** CRLF | `:31` (`join("\n")`) |
| Byte-Order-Mark | **keines** — `charset=utf-8` steht nur am Blob-MIME-Typ, nicht in den Bytes | `:31` |
| Dateiname | konstant `bestellvorschlag.csv`, **ohne** Datum | `:33` |
| Zeilenumfang | alle Zeilen | `:30` |
| `Vorschlag` | Lückenformel `max(0, mindestbestand − bestand)` | `_lib/domain/vorschlag.ts`, §5.4 |

**Beispiel-Ausgabe** (Platzhalterdaten, drei Zeilen; `⏎` markiert das `\n`):

```
"Artikel";"Bestand";"Mindestbestand";"Vorschlag";"Einheit";"Status"⏎
"Mullbinde 8cm";"12";"20";"8";"Stk.";"offen"⏎
"Kompresse 10x10";"0";"40";"40";"Pkg.";"bestellt"⏎
"Handschuh ""M""";"5";"30";"25";"Paar";"offen"⏎
```

Die letzte Zeile zeigt die Quote-Verdopplung aus `csvCell` (`:8`): der Artikelname
`Handschuh "M"` wird zu `"Handschuh ""M"""`.

⚠️ **`Status` bleibt `bestellt`/`offen`, obwohl die Bestellliste in der Oberfläche künftig
„bestellt seit &lt;Datum&gt;" zeigt** (§5.5). Das eine ist ein Ausgabeformat mit einem Abnehmer
außerhalb des Repos, das andere eine Anzeige. Sie dürfen auseinanderlaufen.

**Entscheidung 9-B — `BESTELL_FAKTOR` fällt ersatzlos.** Vollständig begründet in §4.8 und §10.2,
inklusive der drei mitzustreichenden Teststellen. Berechnet wird ausschließlich die Lückenformel.

**Entscheidung 9-C — Formel-Neutralisierung: ja, aber nur auf den Textspalten.**
Die Analyse empfiehlt Option (b) — führendes `=`/`+`/`-`/`@` mit einem vorangestellten Apostroph —
**„aber erst nach Betreiberfrage 43"**. Die Frage ist unbeantwortet geblieben, also entscheidet die
Spec sie mit einer benannten Annahme.

⚠️ **Annahme: der Abnehmer ist eine Tabellenkalkulation (Excel oder LibreOffice), kein maschineller
Importer.** Belegbar ist die Gegenrichtung: der **einzige** im Repo auffindbare maschinelle Abnehmer
wäre der modul-eigene CSV-Import — und der kann diese Datei nicht lesen. Er erwartet fünf
kleingeschriebene Spalten (`HEADER = "name,einheit,fach,mindestbestand,startbestand"`,
`src/lib/csv.ts:3`), rät das Trennzeichen je Zeile (`:15-18`: `line.includes(";") ? ";" : ","`)
und zerlegt per `line.split(delimiter)` **ohne jede Quote-Behandlung**. Weder Spalten noch Quotierung
passen. Es gibt damit keinen benannten Kandidaten für den Importer-Zweig, und (b) ist der Empfehlung
folgende Weg, keine Abweichung.

**Die Schwere — mit Maß, nicht mit Alarm.** Die Klasse ist dieselbe wie beim `feedback`-Befund, die
Exposition ist es nicht: **jede** Textzelle stammt aus einem admin-geschützten Schreibpfad.
`artikel.name`/`einheit`/`fach` entstehen ausschließlich in `createArtikel`/`updateArtikel`
(`src/actions/artikel.ts:17,28`, beide `requireAdmin()`) und im CSV-Import
(`actions/csv.ts:10`, ebenfalls `requireAdmin()`); `Status` ist ein Code-Literal. Der einzige
Schreibweg unterhalb von Admin ist `bucheEntnahmeHelfer` (`actions/buchung.ts:82-87`) — und der
schreibt eine **Menge**, nie eine Textzelle. Das Risiko lautet „ein Admin tippt etwas, das ein
anderer Admin später in Excel öffnet", nicht „ein Unbekannter schiebt eine Formel in eine Datei".

**Die Vorschrift — und warum sie nicht in `csvZelle` gehört:**

```ts
// src/app/m/lagerbuch/_lib/csvZelle.ts   (kein "use client" — Falle 6)

/** Dialekt: jede Zelle gequotet, enthaltene Anfuehrungszeichen verdoppelt. 1:1 aus
 *  BestellListe.tsx:8. Aendert NIE den Zellinhalt. */
export function csvZelle(s: string | number): string {
  return `"${String(s).replaceAll('"', '""')}"`;
}

/** Formel-Neutralisierung — NUR fuer Textspalten. Ein fuehrendes =/+/-/@ wird von
 *  Tabellenkalkulationen als Formelbeginn gelesen; der Apostroph markiert die Zelle
 *  als Text.
 *
 *  WARUM NICHT IN csvZelle, also nicht fuer alle sechs Spalten: eine Zahlenspalte
 *  kann per Konstruktion keine Formel tragen — die Neutralisierung waere dort reine
 *  Kosten. Und `-` ist zugleich das Vorzeichen jeder negativen Zahl: eine Regel im
 *  Dialekt-Helfer machte aus einem Wert -3 die Zeichenkette "'-3", die in jeder
 *  Kalkulation als TEXT ankommt und die Spalte unsummierbar macht. Heute erzeugt
 *  kein Buchungsweg einen negativen Bestand (I2, §5.2.2) — die Falle waere also
 *  still und schluege erst zu, wenn irgendwann eine Differenzspalte hinzukommt. */
export function csvTextZelle(s: string): string {
  return csvZelle(/^[=+\-@]/.test(s) ? `'${s}` : s);
}
```

**Die Zusammensetzung der Datei liegt in einer eigenen Datei — sie ist der eigentliche Vertrag:**

```ts
// src/app/m/lagerbuch/_lib/csvBestellung.ts   (kein "use client" — Falle 6)
import { csvZelle, csvTextZelle } from "./csvZelle";

export type BestellCsvZeile = {
  name: string; bestand: number; mindestbestand: number;
  vorschlag: number; einheit: string; bestellt: boolean;
};

/** 1:1-Pflicht 28: sechs Koepfe, diese Reihenfolge, deutsche Beschriftung.
 *  Exportiert, damit der Test gegen die Konstante prueft und nicht gegen eine
 *  zweite Abschrift derselben Liste. */
export const BESTELL_CSV_KOEPFE = [
  "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
] as const;

export const BESTELL_CSV_DATEINAME = "bestellvorschlag.csv";

export function baueBestellCsv(zeilen: BestellCsvZeile[]): string {
  const kopf = BESTELL_CSV_KOEPFE.map(csvZelle).join(";");
  const reihen = zeilen.map((z) =>
    [
      csvTextZelle(z.name),
      csvZelle(z.bestand),
      csvZelle(z.mindestbestand),
      csvZelle(z.vorschlag),
      csvTextZelle(z.einheit),
      csvTextZelle(z.bestellt ? "bestellt" : "offen"),
    ].join(";"),
  );
  // "\n", nicht CRLF; kein BOM. Beides 1:1 aus BestellListe.tsx:31 — siehe unten.
  return [kopf, ...reihen].join("\n");
}
```

**Für reale Daten ändert sich durch die Neutralisierung nichts** — ein Artikelname wie
`Mullbinde 8cm` fällt durch keinen der vier Präfixe, und `Status` ist ein Code-Literal, das nie
eines tragen kann. Die Kopfzeile läuft ausdrücklich durch `csvZelle`, nicht durch `csvTextZelle`:
sie besteht aus festen Literalen, und ein Apostroph davor wäre eine Formatänderung ohne jeden
Anlass.

**Ausdrücklich unverändert, und ausdrücklich nicht „mit repariert":** das fehlende BOM und das `\n`
statt CRLF. Beide sind heutiges Verhalten und damit 1:1-Pflicht. Ein nachgerüstetes BOM kann einen
Abnehmer stromabwärts brechen, ohne dass es im Modul sichtbar wird — und es würde ausgerechnet die
Kopfzeilenerkennung des modul-eigenen Importers verfehlen (`src/lib/csv.ts:24-27`), falls
jemand die Datei doch einmal dort hineingibt. Ebenfalls unverändert: der konstante Dateiname
`bestellvorschlag.csv`, obwohl wiederholte Downloads im Download-Ordner kollidieren (anders als beim
Excel-Export). Ein datierter Name wäre eine Verbesserung — und eine Formatänderung.

**Client-Insel:** der CSV-Knopf bleibt in einer Client-Komponente. `new Blob`,
`URL.createObjectURL` und `a.click()` (`:31-34`) sind Browser-APIs; eine Server-Variante wäre ein
anderes Produkt (sie kennte den Bestellt-Zustand nur über einen zweiten Rundgang).

### 9.3 Zwischenablage

**Erzeuger:** `copyList()` in `BestellListe.tsx:24-27`.

| Eigenschaft | Wert | Beleg |
|---|---|---|
| Zeilenform | `${vorschlag} × ${name}` | `:25` |
| Trennzeichen im Text | **U+00D7 MULTIPLICATION SIGN**, nicht ASCII `x` | `:25` |
| Zeilentrenner | `\n` | `:25` |
| Zeilenumfang | nur `!bestellt` | `:25` |
| Erfolgsmeldung | `Bestellliste kopiert` | `:26` |
| Fehlermeldung | `Kopieren fehlgeschlagen` | `:26` |

**Beispiel** (Platzhalterdaten):

```
8 × Mullbinde 8cm
25 × Handschuh "M"
```

**Entscheidung 9-D — Die Zwischenablage bekommt einen Rückfallweg, weil sie unter der Suite in
Dev/E2E sonst regressiert.** `navigator.clipboard` verlangt einen **secure context**. Heute läuft
lagerbuch lokal auf `http://localhost:3000` — `localhost` steht auf der Allowlist der Browser. Die
Suite adressiert Module in Dev über `http://<key>.localtest.me:<port>`
(`core/shell/moduleUrl.ts:24-27`); Browser bewerten dabei die **Hostzeichenkette** (`localhost`,
`*.localhost`, `127.0.0.1`), nicht die aufgelöste Adresse. `lagerbuch.localtest.me` ist keines von
beidem. Ohne Gegenmaßnahme ist `navigator.clipboard` dort `undefined`, der `.catch()`-Zweig greift
(`:26`) und die Oberfläche meldet `Kopieren fehlgeschlagen` — das liest sich wie ein Fehler des
Moduls, ist aber eine Eigenschaft der Umgebung.

Vorschrift:

1. `navigator.clipboard?.writeText` wird auf Vorhandensein geprüft, nicht angenommen.
2. Fehlt es, zeigt die Oberfläche den Text in einem `Modal` mit vorselektiertem `Input.TextArea`
   (Client-Insel — `Input.TextArea` ist ein Compound-Zugriff und in einer Server Component HTTP 500,
   Falle 1) und der Meldung
   `„Diese Umgebung erlaubt keinen Zugriff auf die Zwischenablage. Text markieren und kopieren."`
   **Der Text selbst ist zeichengleich derselbe** — der Vertrag ist der Textinhalt, nicht der
   Transportweg.
3. Die beiden bestehenden Meldungen bleiben wortgleich.
4. **E2E behauptet nichts über die Zwischenablage.** Ein Playwright-Test, der
   `navigator.clipboard` liest, prüft die Browserrechte des Testlaufs, nicht das Modul. Die Aussage
   „der kopierte Text ist richtig" gehört in einen Vitest-Test gegen die reine Funktion (§9.6).

**Der Kern wird eine reine Funktion**, damit die Aussage testbar wird, ohne einen Browser zu
brauchen:

```ts
// src/app/m/lagerbuch/_lib/bestellText.ts   (kein "use client")
export function bestellListeText(zeilen: { vorschlag: number; name: string; bestellt: boolean }[]): string {
  // U+00D7, nicht ASCII "x" — 1:1-Pflicht 28. Nur offene Zeilen (BestellListe.tsx:25).
  return zeilen.filter((z) => !z.bestellt).map((z) => `${z.vorschlag} × ${z.name}`).join("\n");
}
```

### 9.4 `bestand-YYYY-MM-DD.xlsx`

**Erzeuger:** `exportieren()` in `ArtikelTable.tsx:128-147`, Zeilenaufbereitung in
`src/lib/bestand-export.ts`.

**Neun Spalten, in dieser Reihenfolge** (`ArtikelTable.tsx:89-99`):

| # | Überschrift | Breite | Typ | Quelle |
|---|---|---|---|---|
| 1 | `Artikel` | 34 | String | `artikel.name` |
| 2 | `Fach` | 12 | String | `artikel.fach` |
| 3 | `Bestand` | 10 | **Number** | berechnet |
| 4 | `Einheit` | 10 | String | `artikel.einheit` |
| 5 | `Mindestbestand` | 16 | **Number** | `artikel.mindestbestand` |
| 6 | `Status` | 22 | String | `bestandStatus()` |
| 7 | `Nächste Charge` | 18 | String | `naechsteCharge.chargenNr` |
| 8 | `Verfall` | 11 | String | `naechsteCharge.verfall` (`YYYY-MM`) |
| 9 | `Hinweis` | 20 | String | `naechsteAblaufText` |

**Die übrigen Festlegungen:**

| Eigenschaft | Wert | Beleg |
|---|---|---|
| Blattname | `Bestand Handlager` | `ArtikelTable.tsx:140` |
| Kopfzeile | fett, fixiert (`stickyRowsCount: 1`) | `:136,141` |
| Zelltypen | Spalten 3 und 5 als `Number`, alle übrigen als `String` | `:138` |
| Status-Literale | `inaktiv` (schlägt alles), sonst `unter Mindestbestand`, sonst `ok` | `lib/bestand-export.ts:34-38` |
| Leere Werte | **Leerstring**, nicht `–` — damit Excel-Filter nicht stolpern | `bestand-export.ts:48-51` |
| Dateiname | `bestand-YYYY-MM-DD.xlsx` aus **lokaler** Zeit | `bestand-export.ts:55-57` |
| Reihenfolge | die der übergebenen Liste — also Suche, Filter-Chips und gewählte Sortierung | `ArtikelTable.tsx:133`, `:112-123` |
| Knopf | deaktiviert, solange `rows.length === 0` | `:163` |
| Fehlertext | `Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.` (mit Halbgeviertstrich) | `:144` |

**Beispiel-Zeile** (Platzhalterdaten):

| Artikel | Fach | Bestand | Einheit | Mindestbestand | Status | Nächste Charge | Verfall | Hinweis |
|---|---|---|---|---|---|---|---|---|
| Mullbinde 8cm | A2 | 12 | Stk. | 20 | unter Mindestbestand | L-42 | 2026-08 | fällig 08/26 |
| Kompresse 10x10 | B1 | 40 | Pkg. | 40 | ok | | | |

**Der Dateiname ist die härteste Zusicherung des ganzen Exports — zweifach festgenagelt:**
`lagerbuch/src/lib/bestand-export.test.ts:44` prüft den exakten String `bestand-2026-07-05.xlsx`,
`lagerbuch/e2e/bestand-export.spec.ts:18` prüft `download.suggestedFilename()` gegen
`/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/`, und `:20-24` prüft zusätzlich den ZIP-Magic `PK` — also eine
echte xlsx, kein umbenanntes CSV. **Die E2E prüft nur die Form, nie den Wert.**

⚠️ **Der Dateiname wird im BROWSER gebildet** (`new Date()` in `ArtikelTable.tsx:142`), also aus der
Zeitzone des Arbeitsplatzes, nicht aus der des Containers. Die `TZ`-Frage ändert an diesem Format
daher nichts — sie wirkt auf die serverseitig abgeleiteten Spalten `Status` und `Hinweis`, und dort
löst §4.5 sie über `_lib/zeit.ts`. **Wandert die Dateinamensbildung je auf den Server, ist
`heuteIso()` aus `_lib/zeit.ts` der richtige Aufruf**, nicht lokale Datumskomponenten.

**Entscheidung 9-E — Die Client-Insel bleibt, und `write-excel-file` wird beim Klick nachgeladen.**
`await import("write-excel-file/browser")` (`ArtikelTable.tsx:132`) hält die Bibliothek aus dem
Seiten-Bundle. Beim RSC-Neubau ist das keine Zeile in `package.json`, sondern die Frage, **welche
Insel den Knopf trägt**. Vorschrift: der Export-Knopf sitzt in derselben Client-Insel wie die
Filterleiste und die Sortierung, weil er deren Zustand braucht (`gefiltert`, `:133`, §5.13.3). Er
bringt mit: `useTransition`-Zustand (`:109`, Beschriftung wechselt auf `Erzeuge…`, `:166`) und den
Fehlerpfad (`:143-145`). Ein rein serverseitiger Export wäre ein **anderes Produkt**: er könnte den
Dateinamen aus Serverzeit bilden und kennte den Filterzustand nicht.

**Entscheidung 9-F — `write-excel-file` wird `package.json` hinzugefügt.** Die Suite hat es nicht
(Falle 58: `jose`, `write-excel-file`, `@zxing/browser`, `@zxing/library` fehlen; `qrcode` und
`nanoid` sind vorhanden). Unter pnpm ist ein nur transitiv vorhandenes Paket nicht importierbar. Die
Alt-Version ist `write-excel-file@^4.1.1` (`lagerbuch/package.json:29`).

**Falle 6 trifft diesen Export mit voller Wucht.** `EXCEL_SPALTEN` (`ArtikelTable.tsx:89-99`) ist ein
**Wert**, der heute in einem `"use client"`-Modul lebt. Die neun Überschriften sind 1:1-Pflicht und
gehören damit in einen Test, den auch eine Server Component lesen können muss. **Vorschrift:** die
Spaltendefinition wandert nach `src/app/m/lagerbuch/_lib/bestandExportSpalten.ts` — **ohne**
`"use client"` —, neben `bestandExportZeilen`, das schon heute richtig außerhalb der Client-Grenze
liegt (`src/lib/bestand-export.ts`). Bleibt sie in der Insel, bekommt eine Server Component
eine Client-Referenz statt des Wertes: HTTP 500 für die ganze Seite, `typecheck` und `build` grün,
und **Vitest kann es strukturell nicht finden**.

**Falle 7 trifft ihn nicht** — und das ist der Grund, den man aufschreiben muss, damit ihn niemand
später „aufräumt": `ArtikelTable` trägt `"use client"` (`:1`), das `Sheet`-Icon (`:4,166`) läuft
dort. Wandert der Knopf jemals in eine Server Component, ergibt der Icon-Import HTTP 500 **beim
Import, nicht beim Rendern**, und `"use client"` auf der Icon-Datei behebt das nicht, sondern macht es
still.

**Entscheidung 9-G — Der Formelschutz berührt den Excel-Pfad nicht.** `ArtikelTable.tsx:138`
schreibt jede nicht-numerische Zelle ausdrücklich als `{ value: String(…), type: String }` — die
Bibliothek legt sie als Textzelle an, nie als Formel. Eine Neutralisierung hier wäre eine
Formatänderung ohne Gegenwert.

**Entscheidung 9-H — Die Artikelliste bleibt in V1 client-seitig gefiltert.** Der Knopftitel sagt zu:
„mit der aktuell angezeigten Liste" (`:164`). Sobald die Liste serverseitig paginiert wird, ändert
sich **stillschweigend**, was „Excel-Liste" bedeutet — aus „alles, was ich gerade sehe" wird „die
erste Seite". Das ist damit eine Auflage an §6 (§6.15, Auflagen 9 und 11; eingelöst in §6.9.3 und
§6.9.5): Pagination der
Artikeltabelle ist kein Oberflächendetail, sondern eine Änderung an einem Ausgabeformat. Wird sie
später gebraucht, muss der Export **zuerst** auf eine serverseitige Erzeugung umgestellt werden —
und dann ist Entscheidung 9-E neu zu treffen.

### 9.5 Abgrenzung: der CSV-Import ist kein Ausgabeformat

Der **Import** erwartet fünf kleingeschriebene Spalten
(`HEADER = "name,einheit,fach,mindestbestand,startbestand"`, `src/lib/csv.ts:3`), rät das
Trennzeichen je Zeile (`;` falls vorhanden, sonst `,` — `:15-18`) und zerlegt per
`line.split(delimiter)` **ohne jede Quote-Behandlung**. **Export und Import sind zwei getrennte
Formate.** Die exportierte `bestellvorschlag.csv` ist weder in den Spalten noch in der Quotierung
wieder einlesbar.

**Vorschrift: beide bleiben getrennt.** Wer sie beim Port angleicht, ändert **beide** Verträge
gleichzeitig — den mit der Tabellenkalkulation stromabwärts und den mit jeder Datei, die heute zum
Import bereitliegt. Der Import behält insbesondere seine fehlende Quote-Behandlung: sie 1:1 zu
übernehmen ist die einzige Fassung, unter der eine heute funktionierende Importdatei auch morgen
funktioniert.

### 9.6 Testaufbau — wer welche Aussage besitzt

| Aussage | Testart | Ort | Warum dort |
|---|---|---|---|
| „Die CSV trägt sechs Köpfe in dieser Reihenfolge, semikolongetrennt, jede Zelle gequotet" | Vitest, reine Funktion | `_lib/csvBestellung.test.ts` gegen `BESTELL_CSV_KOEPFE` und `baueBestellCsv(zeilen)` | Der Vertrag ist eine Zeichenkette. Ein DOM-Test würde ihn über einen Blob prüfen, den er nicht lesen kann |
| „Die CSV trägt kein BOM und `\n` statt CRLF" | Vitest, Byte-Vergleich | ebenda | Nur ein Byte-Vergleich sieht ein fehlendes BOM; jeder Textvergleich ist blind dafür |
| „Ein Artikelname mit führendem `=` bekommt einen Apostroph, `-3` in der Bestandsspalte nicht" | Vitest | ebenda | Die Trennung Text-/Zahlspalte ist genau die Stelle, an der eine Ein-Zeilen-Lösung falsch wäre |
| „Der Zwischenablage-Text nutzt U+00D7 und nur offene Zeilen" | Vitest, reine Funktion | `_lib/bestellText.test.ts` | Entkoppelt vom `navigator.clipboard`-Rechteproblem (§9.3) |
| „Die neun Excel-Überschriften stehen in dieser Reihenfolge, mit diesen Breiten und Typen" | Vitest gegen die Konstante | `_lib/bestandExportSpalten.test.ts` | Die Konstante liegt außerhalb der Client-Grenze (Falle 6) und ist damit direkt lesbar |
| „Status-Literale und Leerstring-Regel" | Vitest | `_lib/bestandExport.test.ts` — die drei Fälle aus `lagerbuch/src/lib/bestand-export.test.ts:32-36` 1:1 | Reine Abbildung, kein Browser nötig |
| „Es kommt wirklich eine .xlsx an, mit datiertem Namen" | Playwright | `e2e/lagerbuch-bestand-export.spec.ts` — Regex auf `suggestedFilename()` **und** ZIP-Magic `PK` | Der Export läuft vollständig im Browser, die Bibliothek wird beim Klick nachgeladen. Ein Unit-Test kann das nicht sehen. 1:1 aus `lagerbuch/e2e/bestand-export.spec.ts:18,20-24` |
| „Der gedruckte QR trägt genau `https://<host>/a/<id>`" | Vitest **mit Dekodierung** | `_db/etiketten.test.ts`, Helfer `decodeQr` (sharp+jsQR) | Der einzige Test, der eine Regression der Basis-URL fangen kann (§8.5) |
| „`moduleUrl` liefert `null` → der Bogen verweigert sich mit Meldung" | Vitest | ebenda | Ein Zustand, den es heute nicht geben kann und der nach dem Port der wahrscheinlichste Fehlstart ist |
| „Der Druckast trägt `@page` und `.lb-nichtDrucken` und **kein** `body *`" | Vitest, Quelltext-Scan von `druck.css` | `(druck)/druck.test.ts` | `pnpm build` und Vitest sehen `@media print` nicht; ein Quelltext-Scan besitzt die Aussage „die Regel steht da", nie „sie wirkt" |
| „Der Bogen passt auf gekauftes Etikettenmaterial" | **kein Test** — Probebogen im Runbook | Abnahme aus Entscheidung 8-I | Playwright rendert per Vorgabe für den Bildschirm; die Aussage lebt auf Papier |
| „`/t/<code>` setzt Cookie und landet richtig" | Playwright | `e2e/lagerbuch-helfer.spec.ts` (§7.12.4) | Heute deckt **kein einziger** E2E `/t/` oder `/g/` ab (Falle 32) — und `/t/[code]` bündelt genau die vier Dinge, die der Port ändert: Rate-Limit, Einlösung, Cookie, Redirect |
---

## 10. Grenzen, Zahlen, Env

### 10.1 Warum die Einheit im Namen steht

Das Modul `files` hat diese Lehre teuer bezahlt und sie in `src/app/m/files/_lib/grenzen.ts:1-27`
ausgeschrieben: zwei Alt-Anwendungen führten dieselbe Grenze unter `MAX_FILE_SIZE` (Byte) und
`MAX_FILE_SIZE_MB` (MB), beide `number`, beide Zuweisungen typkorrekt — Build, Typecheck und Vitest
konnten den Unterschied strukturell nicht sehen.

**lagerbuch trägt dieselbe Klasse, nur in einer anderen Gestalt: nicht zwei Einheiten für dieselbe
Zahl, sondern zwei Namen, deren Rangfolge der Sprachgebrauch umkehrt.**
`src/lib/config.ts:36-37` deklariert `WARN_TAGE_KRITISCH` (31) und `WARN_TAGE_FAELLIG` (56).
`src/lib/domain/verfall.ts:14-16` liest sie so:

```ts
if (tage <= opts.kritisch) ampel = "rot";        // verfall.ts:14
else if (tage <= opts.faellig) ampel = "gelb";   // verfall.ts:15
else ampel = "gruen";                            // verfall.ts:16
```

„Kritisch" klingt dringender als „fällig", ist aber das **kleinere** Fenster. Wer die beiden Werte
beim Übertragen vertauscht — 56 nach `kritisch`, 31 nach `faellig` —, bekommt keinen Fehler: der
Gelb-Zweig in `:15` ist dann unerreichbar, weil jede Charge, die `tage <= 31` erfüllt, schon in `:14`
rot geworden ist. Die Ampel hat danach zwei Zustände statt drei, elf Aufrufstellen zeigen sie
(`verwaltung/(admin)/artikel/page.tsx:14`, `verwaltung/(admin)/page.tsx:15`, `helfer/check/page.tsx:36`,
`actions/detail.ts:40`, `actions/aussondern.ts:23`, `db/queries.ts:145`, `:163`, `:189`, `:236`,
`:479`, `db/lagerort-verfall.ts:21`), und **kein Gate sieht es**: beide Werte sind positive
Ganzzahlen, beide Zuweisungen typkorrekt, und ein Test mit einer Charge in 90 Tagen ist unter beiden
Belegungen grün.

**Daraus folgen zwei Festlegungen für dieses Modul.** Erstens tragen die Namen ihre Einheit *und*
ihre Farbe: `LAGERBUCH_VERFALL_ROT_TAGE` und `LAGERBUCH_VERFALL_GELB_TAGE`. Zweitens prüft der Boot
die Kopplung `ROT ≤ GELB` (§10.5, Prüfung 2) — die Umbenennung allein wäre eine Bitte, die Prüfung
ist die Zusage.

⚠️ **Die Umbenennung ist eine Runbook-Eingabe, keine Codearbeit:** ein produktiv gesetztes
`WARN_TAGE_KRITISCH` muss beim Cutover auf den neuen Schlüssel umgeschrieben werden. Sind die Werte
in der produktiven `stack.env` gar nicht gesetzt, greifen die Vorgaben aus `config.ts:36-37`, und die
Zeile entfällt ersatzlos (Betreiberfrage 7).

### 10.2 Was aus den achtzehn Feldern der Alt-Konfiguration wird

`src/lib/config.ts:3-22` deklariert 18 Felder, `:29-48` die 18 zugehörigen Umgebungsvariablen. Die
Frage, die der Betreiber beim Cutover tatsächlich stellt, lautet nicht „welche Zahlen gibt es", sondern
**„was passiert mit dem Wert, den ich heute in `stack.env` stehen habe"**. Deshalb steht hier die
vollständige Liste, auch die der Verlierer.

| Alt-Variable | Beleg | Fate im Modul `lagerbuch` |
|---|---|---|
| `APP_NAME` | `config.ts:30`; gelesen in `layout.tsx:27`, `manifest.webmanifest/route.ts:6-12` | **entfällt.** Der Modulname steht in `core/registry.ts`; die Wortmarke ist Gestaltung, keine Konfiguration. Als Konstante `LAGERBUCH_MARKE` in `_lib/marke.ts` (ohne `"use client"`) |
| `APP_ORG` | `config.ts:31`; `(gate)/page.tsx:21`, `manifest.webmanifest/route.ts:7` | **entfällt**, wird Konstante `LAGERBUCH_ORGANISATION`. Sie ist seit Bestehen unverändert und gehört nicht in eine Datei, die jeder Deploy anfassen kann |
| `APP_TAGLINE` | `config.ts:32`; `(gate)/page.tsx:21`, `manifest.webmanifest/route.ts:13` | **entfällt**, Konstante `LAGERBUCH_ZEILE` |
| `APP_BASE_URL` | `config.ts:33`; `t/[code]/route.ts:19,30`, `db/etiketten.ts:15`, `auth.config.ts:65`, `lib/auth/helferSession.ts:32` | **entfällt.** Entscheidung 8-B: gedruckte Artefakte aus `moduleUrl("lagerbuch")`, alles Bediente relativ (§7.2.3). Eine sechste Wahrheit neben `SUITE_HOST_LAGERBUCH` wäre genau die Sorte Konfiguration, die auseinanderläuft, ohne dass es jemand merkt |
| `DATABASE_PATH` | `config.ts:34`; `db/index.ts:33`, `db/backup.ts:23` | **entfällt.** `core/db` bildet den Pfad aus `DATA_DIR` und dem Modulschlüssel (`moduleDbPath("lagerbuch")`, §4.1) |
| `TZ` | `config.ts:35`, gemappt auf `config.tz` (`:73`) | **Das Feld ist tot und wird gestrichen.** Nachgezählt: der einzige Leser von `config.tz` im ganzen Repo ist `src/lib/config.test.ts:12`. Die wirksame Zeitzone kam schon immer allein aus der Prozessumgebung — **und das Zielmodul liest sie gar nicht mehr** (§4.5, Entscheidung 26 b). `TZ=Europe/Berlin` bleibt **Runbook-Eingabe** für die übrige Suite und ist ein suiteweiter Schritt (§1.5) |
| `WARN_TAGE_KRITISCH` | `config.ts:36` | → `LAGERBUCH_VERFALL_ROT_TAGE` (§10.1, §10.3) |
| `WARN_TAGE_FAELLIG` | `config.ts:37` | → `LAGERBUCH_VERFALL_GELB_TAGE` |
| `BESTELL_FAKTOR` | `config.ts:38`, `:76`, Feld `:12` | **ersatzlos gestrichen** (Betreiber-Entscheidung 5). Nachgeprüft: außerhalb der Konfiguration gibt es genau drei Fundstellen, und keine ist ein Produktivpfad — `actions/bestellung.test.ts:4` (Mock), `lib/config.test.ts:15` und `:23,27` (Parse-Prüfung). **Alle drei werden mitgestrichen.** Gerechnet wird ausschließlich die Lückenformel (§5.4) |
| `HELFER_SESSION_STUNDEN` | `config.ts:39`; `lib/auth/helferSession.ts:14` (JWT-`exp`) und `:33` (Cookie-`maxAge`) | → `LAGERBUCH_HELFER_SITZUNG_STUNDEN` |
| `NODE_ENV` | `config.ts:40` | **entfällt**, gehört der Suite |
| `AUTH_SECRET` | `config.ts:41` | **entfällt aus dem Modul.** Die Suite führt genau ein `AUTH_SECRET` (`core/auth/config.ts:86`, `compose.yaml:23` mit `${AUTH_SECRET:?…}`). **Siehe die begründete Abweichung in §10.6** |
| `HELFER_SESSION_SECRET` | `config.ts:42`, Prod-Riegel `:109-113` | → **`LAGERBUCH_HELFER_SITZUNG_SECRET`**, **Wert 1:1 aus der produktiven `stack.env`** (Betreiber-Entscheidung 4). Der Schlüsselname ändert sich, der Wert nicht |
| `OIDC_ISSUER` | `config.ts:43`; `(gate)/page.tsx:22` | **entfällt**, → `POCKET_ID_ISSUER` der Suite (`compose.yaml:26`) |
| `OIDC_CLIENT_ID` | `config.ts:44` | **entfällt**, → `POCKET_ID_CLIENT_ID` (`compose.yaml:27`) |
| `OIDC_CLIENT_SECRET` | `config.ts:45` | **entfällt**, → `POCKET_ID_CLIENT_SECRET` (`compose.yaml:28`) |
| `OIDC_ADMIN_GROUP` | `config.ts:46`; `auth.config.ts:13` | → **`SUITE_ADMIN_GROUP_LAGERBUCH`** (Betreiber-Entscheidung 3). Der Wert wandert 1:1; der Suite-Admin bekommt dadurch **keine** Lagerbuch-Rechte (§3.6.1) |
| `AUTH_DEV_LOGIN` | `config.ts:47`; `auth.config.ts:41`, `(gate)/page.tsx:23` | **entfällt.** Der Dev-Provider ist der der Suite (`core/auth/config.ts:55-68`) und nimmt `email` **und** `groups` — für die E2E ist das eine Änderung, §12.6 |
| — | — | **Neu, ohne Alt-Entsprechung:** die drei Gate-Zahlen aus §10.3 |

**Der Riegel `assertProductionSecrets` (`config.ts:101-113`) wandert nicht als Datei, sondern als
Aussage.** Er hängt heute an `src/instrumentation.ts:6` — einer Datei, die es in der Suite gibt
(`iuk-suite/src/instrumentation.ts`) und die niemand modulweise anfasst; die Suite-Bootstrap prüft
Hosts, Gruppen und die files-Blob-Ablage (`core/bootstrap.ts:40-49`). Der Ort für den lagerbuch-Riegel
ist derselbe wie bei `files`: eine Funktion, die `assertHostConfig()` mit aufsammelt (§10.5).

### 10.3 Alle Namen mit Einheit

In **einer** Datei, `src/app/m/lagerbuch/_lib/grenzen.ts`, **ohne `"use client"`**. Das ist keine
Formalie: die Zahlen liest sowohl eine Server Component (`verwaltung/artikel/page.tsx`) als auch eine
Client-Insel (die Zähl-Liste), und **ein Wert aus einem `"use client"`-Modul kommt in einer Server
Component nicht an** — sie bekommt eine Client-Referenz statt der Zahl, HTTP 500 für die ganze Seite
(`CLAUDE.md:24-27`, Falle 6). `pnpm build` findet das nicht, und **Vitest kann es strukturell nicht
finden**, weil `"use client"` dort ein wirkungsloser String ist.

**Diese Datei hält keine Millimeter.** Die Druckgeometrie des Etikettenbogens (§8.4) ist
CSS-Geometrie und gehört dorthin; was Server- und Client-Seite beide brauchen, liegt in
`_lib/etikettMasse.ts`. Sie in `grenzen.ts` zu spiegeln erzeugte eine zweite Wahrheit, die niemand
gegen das Papier prüft. Vorbild ist der Absatz „DIESE DATEI HAELT KEINE HOSTREGEL UND KEINE
ABLAGE-PROBE" in `files/_lib/grenzen.ts:22-26`.

| Name (Einheit im Namen) | Vorgabe | Bereich | Quelle / wer setzt | Was ein falscher Wert anrichtet |
|---|---|---|---|---|
| `LAGERBUCH_VERFALL_ROT_TAGE` | 31 (`config.ts:36`) | 1 … 3650, **≤ GELB** | Env, Betreiber (`.env`) | Zu klein: Chargen laufen ab, ohne je rot gewesen zu sein — die Ampel warnt zu spät, und niemand merkt es, weil sie ja etwas anzeigt. Zu groß und über GELB: **der Gelb-Zweig `verfall.ts:15` wird unerreichbar**, die Ampel hat zwei Zustände statt drei (§10.1) |
| `LAGERBUCH_VERFALL_GELB_TAGE` | 56 (`config.ts:37`) | 1 … 3650, **≥ ROT** | Env, Betreiber | Zu groß (etwa 3650): alles außer dem Neuwareneingang steht dauerhaft auf Gelb, die Vorwarnung wird zum Grundrauschen und die Verwaltung hört auf hinzusehen. **Deshalb die Obergrenze:** die Kopplungsprüfung allein lässt `ROT=9999, GELB=99999` durch, und das ist eine Ampel, die immer leuchtet |
| `LAGERBUCH_HELFER_SITZUNG_STUNDEN` | 12 (`config.ts:39`) | 1 … 24 | Env, Betreiber | Der Wert steht **zweimal** in derselben Sitzung: als JWT-`exp` (`helferSession.ts:14`) und als Cookie-`maxAge` (`:33`). Zu groß ist keine Bequemlichkeit, sondern eine Ausweitung: ein laminiertes Kärtchen, das aus einem Fahrzeug verschwindet, gibt dem Finder genau so lange Lesezugriff auf den gesamten Bestand, wie diese Zahl sagt (§3.4.3, §3.4.4). **Obergrenze 24**, weil eine Feldsitzung nie länger als eine Schicht plus Puffer dauern darf |
| `LAGERBUCH_HELFER_SITZUNG_SECRET` | **keine** — Pflicht, sobald das Modul erreichbar ist | ≠ leer, ≠ `dev-insecure-secret-change-me`, ≠ `AUTH_SECRET`, ≥ 32 Zeichen | Env, Betreiber; **Wert 1:1 aus der alten `stack.env`** | Leer: `jose` verweigert einen Nullschlüssel („Zero-length key is not supported"), `createHelferSitzung` wirft — heute fängt das der Boot ab (`config.ts:109-113`), ohne den Riegel bootet der Container grün und fällt erst beim ersten `/t/<code>`-Scan mit 500 um. **Das Scheitern wanderte von der Startzeit in die Nutzungszeit** (Falle 23). Gleich `AUTH_SECRET`: keine Domänentrennung mehr zwischen Suite-Sitzung und Helfer-Sitzung — dieselbe Signatur trägt zwei Bedeutungen |
| `LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | 5 (`lib/auth/rateLimit.ts:4-5`) | 1 … 60, **≤ GESAMT_PRO_MIN** | Env, Betreiber | Zu groß: der Coderaum ist 10⁶ (§8.3), und ein Treffer gibt nicht nur Lesezugriff, sondern Entnahmebuchung und Check-Abschluss. Zu klein: alle Helferinnen hinter demselben Uplink teilen sich den Eimer, sobald der Absenderschlüssel zusammenfällt — eine Bereitschaft an einem Anschluss kommt dann zu Schichtbeginn nicht herein. ⚠️ Der Eimer wird **nur bei Fehlversuchen** verbraucht (§3.5.3); dieselbe Zahl ist damit deutlich großzügiger als heute |
| `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | 30 | 1 … 600, **≥ ABSENDER**, **≤ GESAMT_PRO_STUNDE** | Env, Betreiber | Die modulweite Burst-Kappe gegen Rotation des Absenderschlüssels (§3.5.3). 30 = sechs Absender-Budgets. Zu groß: sie trägt nichts. Zu klein: sie trägt zu viel — bei 1 genügt ein Tippfehler pro Minute im ganzen Haus. **Sie greift ausdrücklich nur bei Fehlversuchen und ausdrücklich nach der Codeprüfung**, ein gültiger Code kommt also immer durch |
| `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | 300 | 1 … 3600, **≥ GESAMT_PRO_MIN** | Env, Betreiber | **Der tragende Zähler** (§3.5.3). 300 = 5/min × 60 — die Zahl stellt genau die Zusage wieder her, die das Per-Absender-Limit nur unter der Annahme einer wahrhaftigen Adresse je hatte. ⚠️ **Runbook-Eingabe:** `select count(*) from tokens where aktiv = 1`; liegt die Zahl oberhalb von etwa 60, gehört der Wert gesenkt |
| `JOURNAL_GRENZE` | 100 (`db/queries.ts:87`) | **Konstante**, nicht Env | Spec | Die stille Obergrenze des Journals, Entscheidung 35 (a). Sie ist heute ein Vorgabewert, den kein Aufrufer je überschreibt; sie zur Env-Variablen zu machen, hieße einen Regler anzubieten, der bei 5000 die Journalseite bei realer Datenmenge stehen lässt (Falle 10). Gelesen wird `GRENZE + 1`, angezeigt `GRENZE`, und der Hinweis erscheint **nur**, wenn die Grenze tatsächlich griff (§5.14.3) |
| `CHECK_GRENZE` | 50 (`db/queries.ts:350`) | **Konstante** | Spec | Dieselbe Regel, und der strengere Fall: die Checks-Seite nennt ihre 50 heute **an keiner Stelle** |
| `BZ_LOGBUCH_GRENZE` | 100 (`src/db/bz.ts:124`) | **Konstante** | Spec | dito |
| `MTK_WARN_TAGE` | 30 (`lib/domain/geraet.ts:4`) | **Konstante**, liegt in `_lib/domain/geraet.ts` | Spec | siehe unten |
| `OBJEKT_ABLAUF_WARN_TAGE` | 30 (`lib/domain/geraet.ts:5`) | **Konstante** | Spec | siehe unten |
| `BZ_KONTROLL_INTERVALL_TAGE` | 31 (`lib/domain/bz.ts:4`) | **Konstante** | Spec | siehe unten |
| `BZ_WARN_TAGE` | 5 (`lib/domain/bz.ts:7`) | **Konstante** | Spec | siehe unten |
| `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` | 14 (`db/backup.ts:28`, heute ein nacktes Literal im Aufruf) | 1 … 365 | **bedingt**, siehe §10.7 | Zu klein: die einzige historische Tiefe des Moduls schrumpft, ohne dass es irgendwo sichtbar wird. Zu groß: `/data` läuft voll, und das trifft **alle fünf** Module derselben Suite |

**Warum vier Warnfenster Konstanten bleiben und zwei nicht.** `MTK_WARN_TAGE`,
`OBJEKT_ABLAUF_WARN_TAGE`, `BZ_KONTROLL_INTERVALL_TAGE` und `BZ_WARN_TAGE` sind heute Code-Konstanten
(`geraet.ts:4-5`, `bz.ts:4,7`) und waren nie Env — sie jetzt konfigurierbar zu machen, wäre eine
Neuerung, die niemand beauftragt hat. Bei `BZ_KONTROLL_INTERVALL_TAGE` ist es mehr als das: die 31
Tage sind die Prüfvorgabe für die Kontrolllösung, nicht der Geschmack des Betriebs, und ein Regler
daran lädt dazu ein, eine Fälligkeit wegzukonfigurieren statt sie zu erfüllen. Die beiden
Verfall-Schwellen sind dagegen **heute schon** Env (`config.ts:36-37`) — ein Rückbau auf Konstanten
wäre eine Verhaltensänderung gegen einen möglicherweise gesetzten Prod-Wert (Betreiberfrage 7).
Die Namen tragen in **beiden** Fällen ihre Einheit; das ist der Punkt, nicht die Herkunft.

**Werte für Dev und E2E** — verbindlich in `.env.example` und in `webServer.env` der
`iuk-suite/playwright.config.ts`. „Klein" ist hier kein zulässiger Eintrag, weil die Kopplungen aus
§10.5 sonst greifen, bevor ein Test läuft:

| Variable | Wert | Rechnung |
|---|---|---|
| `SUITE_HOST_LAGERBUCH` | `lagerbuch.localtest.me` | Der Host-Riegel bräuchte sie nicht (§2.6), aber die Zahlen-Boot-Prüfungen hängen an `prodHostsFor(...).length > 0`, und der Zwei-Host-E2E aus §12.2 ist sonst nicht darstellbar |
| `LAGERBUCH_HELFER_SITZUNG_SECRET` | `e2e-helfer-secret-nicht-produktiv-32z` | ≠ leer, ≠ Alt-Default, ≠ `AUTH_SECRET` der E2E-Konfiguration, ≥ 32 Zeichen |
| `SUITE_ADMIN_GROUP_LAGERBUCH` | `lagerbuch-admin` | muss gesetzt sein (§10.5, Prüfung 5) und mit `devLogin(…, {groups})` übereinstimmen (§12.6) |
| `LAGERBUCH_VERFALL_ROT_TAGE` | `31` | Fixtures rechnen gegen die Vorgabe |
| `LAGERBUCH_VERFALL_GELB_TAGE` | `56` | `≥ ROT` |
| `LAGERBUCH_HELFER_SITZUNG_STUNDEN` | `12` | 1:1; kürzer bringt nichts, weil kein Test 12 h wartet |
| `LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | `5` | Der Sperrtest braucht eine erreichbare Grenze; bei 5 sind es sechs Fehleingaben |
| `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | `30` | `≥ ABSENDER`; der Absendertest darf die Gesamtbremse nicht auslösen und damit die Ursache verwischen |
| `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | `300` | `≥ GESAMT_PRO_MIN` |

⚠️ **`SUITE_ACCESS_GROUP_LAGERBUCH` wird NICHT gesetzt** — ein gesetzter Wert bricht den Boot ab
(§2.5, §10.5 Prüfung 6).

### 10.4 Der Absenderschlüssel des Helfer-Gates

Betreiber-Entscheidung 6 verlangt, dass diese Frage **entschieden** wird. **Sie ist es — vollständig
in §3.5.** Dieser Abschnitt hält nur fest, was daraus für die *Zahlen* und die *Env-Oberfläche*
folgt, damit niemand hier eine zweite Antwort erfindet:

- Die Adresse kommt aus `_lib/absender.ts`: `cf-connecting-ip` mit `cf:`-Präfix, sonst der konstante
  Sammelschlüssel `"direkt"`. **`x-forwarded-for` wird in keiner Richtung gelesen** — weder der
  erste noch der rechteste Eintrag, weil unter Direktzugriff beide vom Anfragenden gesetzt werden.
- **`core/ratelimit.ts` wird nicht angefasst** (§3.5.4). Für portal, qr, feedback und files ändert
  sich nichts. Die `RateLimiter`-Klasse wird wiederverwendet, `clientIpAus` nicht.
- **Es gibt deshalb kein `SUITE_TRUSTED_PROXY_HOPS` und kein `SUITE_CF_TRUSTED`.** Die richtige
  Hop-Zahl lässt sich aus dem Repo nicht ermitteln, und ein geratener Mechanismus ist schlechter als
  eine benannte Grenze. Die Env-Oberfläche dieses Themas besteht ausschließlich aus den **drei
  Gate-Zahlen** in §10.3.
- **Der Absenderschlüssel bleibt umgehbar, und die Abhilfe ist keine Env-Variable, sondern eine
  Netzentscheidung:** kein Host-Port-Mapping am Suite-Dienst, Traefik-Entrypoint nur aus den
  Cloudflare-Bereichen erreichbar. Das ist eine **Runbook-Zeile mit Gegenprobe** (§3.5.2, §14),
  keine Konfiguration im Repo. Solange der direkte Weg offen ist, tragen allein die beiden
  modulweiten Zähler.

### 10.5 Boot-Prüfungen

In derselben Kette wie `assertHostConfig()` (`core/bootstrap.ts:40-49`, gerufen aus
`iuk-suite/src/instrumentation.ts` **vor** `migrateAllModules()`; die Funktion ist `async` und wird
awaited, weil `filesBootFehler()` das verlangt). Die Prüfungen greifen **nur**, wenn
`prodHostsFor(getModule("lagerbuch")).length > 0` — genau die Bedingung, die
`files/_lib/grenzen.ts:347-351` bereits fährt.

**Die Bedingtheit ist keine Milderung, sondern eine Notwendigkeit.** `assertHostConfig()` läuft für
die **ganze** Suite. Eine unbedingte Pflicht hieße: sobald ein Image mit `lagerbuch` auf dem Server
landet, startet die Suite nicht mehr — portal, qr, feedback und files inklusive —, bis der Betreiber
die `.env` ergänzt hat. Damit blockierte dieses Modul jeden unbeteiligten Deploy im Fenster zwischen
Merge und Cutover. Und der Schalter ist **dieselbe** Variable, die das Modul einschaltet
(`SUITE_HOST_LAGERBUCH` über `prodHostsFor`) — es gibt keinen zweiten, den jemand vergessen kann.

1. **Jede Pflicht- und Zahlvariable ist gesetzt, ganzzahlig und im Bereich.** Gelesen wird mit einem
   eigenen `/^[+-]?\d+$/`, **nicht** mit `Number()`: `Number("0x10")` ist 16 und ganzzahlig, eine
   Prüfung über `Number` allein ließe Hex und `1e7` durch, und die geltende Grenze wäre eine andere
   als die, die in der `.env` steht (Vorbild `files/_lib/grenzen.ts:199`). Leer gesetzt gilt wie
   nicht gesetzt: `LAGERBUCH_VERFALL_ROT_TAGE=` ist der häufigere Fall als die fehlende Zeile, und
   `Number("")` wäre 0.
2. **`LAGERBUCH_VERFALL_ROT_TAGE ≤ LAGERBUCH_VERFALL_GELB_TAGE`.** Die Meldung nennt beide Namen,
   beide Werte und die Folge: „sonst ist der Gelb-Zweig unerreichbar und die Ampel hat zwei Zustände
   statt drei".
3. **`…GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN ≤ …GATE_FEHLVERSUCHE_GESAMT_PRO_MIN ≤
   …GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE`.** Bricht die erste Ungleichung, füllt ein einzelner
   Absender die Gesamtbremse, bevor sein eigener Eimer leer ist — die Reihenfolge der Bremsen wäre
   umgekehrt zur Absicht. Bricht die zweite, ist der Stundendeckel wirkungslos.
4. **`LAGERBUCH_HELFER_SITZUNG_SECRET` ist gesetzt, nicht leer, mindestens 32 Zeichen lang, nicht
   `dev-insecure-secret-change-me` und nicht identisch mit `AUTH_SECRET`.** Die ersten vier
   Bedingungen sind `assertProductionSecrets` (`config.ts:104-113`) an seinem neuen Ort; die fünfte
   ist neu und kostet eine Zeile: dieselbe Signatur für Suite-Sitzung und Helfer-Sitzung hebt die
   Domänentrennung auf, die das eigene Geheimnis überhaupt erst begründet (§3.4.1).
5. **`SUITE_ADMIN_GROUP_LAGERBUCH` ist gesetzt und nicht leer.** Ohne sie ist niemand
   Lagerbuch-Admin, und weil der Suite-Admin-Kurzschluss für dieses Modul bewusst nicht gilt
   (Betreiber-Entscheidung 3), ist die Folge ein **stummes 404 für alle Verwaltenden** — die
   häufigste Go-live-Fehlkonfiguration. Diese Prüfung ist billig und sie ist die einzige, die den
   Fall vor dem ersten Anruf sichtbar macht (§3.6.2).
6. **`SUITE_ACCESS_GROUP_LAGERBUCH` ist NICHT gesetzt.** Ein gesetzter Wert wäre still wirkungslos —
   `validateGroupConfig` (`core/groups.ts:120-142`) meldet nur den **leer** gesetzten Fall (`:137`).
   Die Meldung nennt den Grund und den Ausweg (§2.5, Punkt 3).

**Was der Boot NICHT prüfen kann** — Runbook-Schritte, nicht Codearbeit:

| Zusage | Prüfweg |
|---|---|
| Die Prozess-Zeitzone ist `Europe/Berlin` | `docker exec … node -e "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)"` gegen den laufenden Container. Suiteweiter Schritt, nicht Teil dieser Spec. ⚠️ **Für lagerbuch selbst ist er nicht tragend** (§4.5) |
| Der direkte Weg an Cloudflare vorbei ist geschlossen | Anfrage aus dem lokalen Netz gegen den Traefik-Entrypoint mit gesetztem `CF-Connecting-IP`; erwartet: keine Antwort statt einer Anwendung mit gefälschtem Absender (§3.5.2) |
| `LAGERBUCH_HELFER_SITZUNG_SECRET` trägt wirklich den alten Wert | eine bestehende `helfer_session` aus einem laufenden Browser gegen die neue Instanz halten; erwartet: keine erneute Code-Eingabe (Betreiber-Entscheidung 4). ⚠️ Trägt nur, wenn der Host zeichengleich ist (§7.4.1) |
| Die alte `stack.env` ist nach dem Abbau gelöscht | im Abbau-Teil des Runbooks. Ein übernommenes Sitzungsgeheimnis lebt danach an zwei Stellen; bleibt die alte Datei liegen, bleibt ein gültiger Schlüssel in einer Datei, die niemand mehr pflegt |
| Die produktiven Werte der Zahlen | aus der alten `stack.env` ablesen und auf die neuen Schlüssel umschreiben (§10.1). Stehen sie dort nicht, gelten die Vorgaben |

### 10.6 Zwei begründete Abweichungen

**Abweichung 1 — `AUTH_SECRET` wird NICHT aus der produktiven `stack.env` übernommen.**
Betreiber-Entscheidung 4 nennt beide Geheimnisse in einem Atemzug. Für `HELFER_SESSION_SECRET`
funktioniert das und ist die richtige Wahl: es ist modul-privat, niemand sonst liest es, und der
Gegenwert ist konkret — eine Helferin, die beim Cutover mitten in einem Fahrzeug-Check steht, verliert
ihre bis zu zwölf Stunden alte Sitzung nicht.

Für `AUTH_SECRET` kehrt sich die Rechnung um. Die Suite führt **ein** `AUTH_SECRET`
(`core/auth/config.ts:86`, `compose.yaml:23`), und es signiert die Sitzungen **aller**
Module. Es auf lagerbuchs Wert zu setzen, um lagerbuchs Verwaltungs-Sitzungen zu retten, würde jede
laufende Sitzung in portal, qr, feedback und files ungültig machen — vier laufende Module gegen die
Bequemlichkeit einer Handvoll Verwaltender. Dazu kommt: lagerbuchs Verwaltungs-Sitzungen laufen heute
gegen lagerbuchs **eigenen** OIDC-Client; nach dem Port meldet sich die Verwaltung ohnehin über den
Suite-Client an, und der Cookie-Name und die Cookie-Domain (`core/auth/cookies.ts:46-58`,
`AUTH_COOKIE_DOMAIN`) sind andere. Eine Sitzung, die den Cutover überlebte, wäre technisch nicht
herstellbar, nur der Schlüssel wäre derselbe. Und selbst wenn: lagerbuchs Alt-JWT trägt
`token.isAdmin`, aber **kein** `token.groups` — der Session-Callback der Suite liest ausschließlich
`token.groups` (`core/auth/config.ts:163-165`), ein entschlüsselbares Alt-Token ergäbe `groups: []`
und `istLagerbuchAdmin` antwortete `false` (§3.4.1).

→ **`AUTH_SECRET` bleibt der bestehende Suite-Wert. Die Verwaltung meldet sich nach dem Cutover
einmal neu an.** Das gehört als Zeile ins Runbook, nicht als Überraschung. **Und es ist keine
Verletzung von Betreiber-Entscheidung 4, sondern ihre Erfüllung:** die Verwaltungs-Sitzungen
überleben, *weil* das Suite-Geheimnis unangetastet bleibt.

**Abweichung 2 — `LAGERBUCH_HELFER_SITZUNG_SECRET` kommt über `env_file`, nicht als
`${VAR:?…}`-Zeile unter `environment`.** Falle 23 nennt die `:?`-Form ausdrücklich als Abhilfe, und
`compose.yaml:23` fährt sie für `AUTH_SECRET`. Für ein Modulgeheimnis ist sie trotzdem falsch: eine
`:?`-Zeile in der versionierten `compose.yaml` hält den **ganzen** Stack an, sobald das Image mit
lagerbuch ankommt und die `.env`-Zeile noch fehlt — genau der unbeteiligte Deploy, den §10.5 aus dem
Weg räumt. Der Suite-eigene Kommentar an `compose.yaml:5-13` erklärt, warum Modulwerte über
`env_file` laufen: damit „nicht gesetzt" auch wirklich „nicht gesetzt" bleibt. → Die Variable steht in
der `.env`; **die Boot-Prüfung 4 ist der Riegel**, und sie greift genau dann, wenn das Modul
erreichbar ist. **Der Unterschied zu Falle 23 ist nur der Ort, nicht die Härte:** das Scheitern
bleibt in der Startzeit, und der leere String wird ausdrücklich mitgeprüft.

### 10.7 Eine Zahl mit Vorbehalt

`LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` existiert **nur**, wenn der Betreiber Entscheidung 22 (§15.1 Nr. 4) auf
(b) legt — den Backup-Job als `starteLagerbuchHintergrund()` mitzunehmen. Heute steht die 14 als
nacktes Literal im Aufruf (`db/backup.ts:28`), der Tick läuft stündlich (`:44`) und schnappt ab
`getHours() >= 2` zu (`:42`, mit ausgeschriebener DST-Begründung in `:33-37`).

⚠️ **Annahme, falls kein anderes Kapitel die Entscheidung trifft:** es gilt (a) — `scripts/backup.sh`
der Suite erfasst `lagerbuch.db` über den vorhandenen Glob, der Modul-Job wandert **nicht** mit, und
`LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` entfällt ersatzlos; `startBackgroundWork()` bekommt keinen
lagerbuch-Eintrag (§2.2, Punkt 7). Der Preis ist benannt: Tarball-Körnung statt Einzeldateien und
`KEEP` statt Tagen. Und in **jedem** Fall gilt die Runbook-Zeile, das `backups/`-Verzeichnis im
Volume `lagerbuch_data` vor dem Abbau des Alt-Stacks wegzusichern — es ist die einzige historische
Tiefe vor dem Cutover-Snapshot.

### 10.8 Die Bauform von `_lib/grenzen.ts`

Drei Eigenschaften sind nicht verhandelbar, und die dritte hat lagerbuch selbst schon einmal
gekostet:

1. **Eine Tabelle, zwei Leser.** `grenzen()` (die geltenden Werte) und `grenzenFehler()` (die
   Boot-Liste) lesen aus **derselben** `ZAHLEN`-Konstante; zwei Tabellen wären zwei Wahrheiten, und
   der Boot prüfte etwas anderes als das, was zur Laufzeit gilt (`files/_lib/grenzen.ts:95-133`).
2. **Die Tabelle wird nicht exportiert, nur die Namensliste.** Sonst zieht der Test seine
   Erwartungswerte aus der Implementierung und bleibt auch bei falscher Einheit grün — genau das ist
   bei `files` passiert und von der unabhängigen Testtabelle gefunden worden
   (`files/_lib/grenzen.ts:137-151`).
3. **Gelesen wird bei JEDEM Aufruf, nicht beim Import.** `src/lib/config.ts:89` ist heute
   `export const config = parseConfig(process.env)` — ein Modul-Singleton —, und `:91-99` schreibt
   über vierzehn Zeilen aus, warum der Secret-Riegel deshalb **nicht** in `parseConfig` stehen darf:
   `next build` läuft mit `NODE_ENV=production` und ohne Secrets, und der Singleton wird zur Bauzeit
   ausgewertet. Ein unbesehen mitportierter Singleton, der jetzt zusätzlich Pflichtvariablen fordert,
   **bricht `pnpm build`** — und kein Kapitel dieser Spec sonst fängt das ab. `grenzen(env = process.env)`
   nimmt die Umgebung als Parameter und liest sie zur Aufrufzeit; dieselbe Form wie `DATA_DIR` in
   `core/db` und wie `files/_lib/grenzen.ts:368`.

---

## 11. Fehlerbehandlung und Zustände

### 11.1 Ausgangslage in zwei Sätzen

lagerbuch hat **null** Grenzdateien: unter `src/app/` liegt weder `error.tsx` noch `global-error.tsx`
noch `not-found.tsx` noch `loading.tsx`. Die Suite hat genau **eine** — nachgezählt am Arbeitsbaum
liefert die Suche nach diesen vier Namen unter `iuk-suite/src/app/` ausschließlich
`src/app/not-found.tsx`. Die Portierung erbt aus beiden Richtungen nichts.

Dazu die drei Sorten Sprungstellen: 8 `notFound()`, 10 `redirect()` aus Seite, Layout oder Action, und
22 deutschsprachige Meldungstexte in Würfen — und **22 Action-Aufrufe ohne `catch`** (Falle 62), deren
Ablehnung React an die nächste Fehlergrenze weiterreicht. Die gibt es heute nicht und nach dem Port
auch nicht — bis auf die eine, die §11.2 einzieht.

### 11.2 Die Festlegung: (a) + (d) + eine `error.tsx`, ausdrücklich keine `not-found.tsx`

Entscheidung 36 wird so entschieden:

**(a) Gestaltete Zustände in der Seite, wo ein Mensch mit einem gedruckten oder gescannten Gegenstand
vor dem Bildschirm steht.** Das ist der Hausstil der Suite und er ist zweimal ausgeschrieben:
`m/files/(oeffentlich-inbox)/u/[token]/page.tsx:13-17` hält HTTP 200 in jedem Fall fest — „der Melder
steht mit einem gedruckten Zettel vor einem Handy und hat sich vertippt" — und
`m/feedback/f/[slugSecret]/page.tsx:257-262` macht es genauso.

**(d) Die 22 ungefangenen Aufrufstellen werden an der Ursache behoben, nicht am Symptom.** Falle 66
beweist, warum: der Produktions-Deserialisierer im Browser-Bündel hat für eine Fehlerzeile genau
einen Zweig und baut einen `Error` mit dem festen englischen Text über eine „server-side exception".
**Die 22 sorgfältig formulierten deutschen Meldungen sind fachlich richtig und betrieblich
wirkungslos.** Jede *erwartbare* Fehlerlage wird deshalb als **Rückgabewert** geführt — die Form, die
`files` schon fährt (`m/files/(verwaltung)/actions.ts:60-61`, `:310-311`) und die §7.3 für den
Helfer-Weg als `HelferErgebnis` typisiert. Der Wurf bleibt allein dem Riegelfall vorbehalten
(`core/auth/guards.ts:20-24`), wo kein Text nach außen soll.

**Dazu `src/app/m/lagerbuch/error.tsx`** als Auffangfläche für den *unerwarteten* Wurf im Render. Sie
trägt die Modul-Anmutung, einen Satz ohne Technik („Diese Ansicht konnte nicht geladen werden"), den
Knopf „Erneut versuchen" (`reset()`) und einen Weg zurück in die Modulwurzel.

⚠️ **`error.tsx` trägt `"use client"` in Zeile 1 — ohne Ausnahme.** Next verlangt das für jede
Fehlergrenze, und `reset()` ist eine Prop, die nur ein Client-Modul annehmen kann. Ein Dokument, das
die `"use client"`-Grenze sonst an jeder Datei ausdrücklich entscheidet, muss es auch hier sagen.
Zwei Folgen:

- **Sie ist die einzige `"use client"`-Datei außerhalb von `_ui/`** — als Segmentdatei muss sie neben
  der Route liegen. Das Verbot aus §2.1 richtet sich gegen `_lib/` (Falle 6) und bleibt davon
  unberührt; den Rahmen darf sie sich weiterhin aus `_ui/` holen.
- **Ihre Texte kommen aus `_lib/`, ihre Symbole sind Inline-SVG** (§11.6). Ein Zustandstext, den sie
  selbst hielte, wäre ein Wert aus einem Client-Modul und damit Falle 6 für jede Server Component,
  die ihn mitliest; ein `@ant-design/icons`-Import wäre Falle 7.
⚠️ **Prüfpunkt, keine Behauptung:** dass eine Modul-`error.tsx` **innerhalb** von
`m/lagerbuch/layout.tsx` rendert, ist im Repo an keinem Bestandsmodul ablesbar — es gibt keine
einzige. Der Nachweis ist billig und gehört in die Bau-Task: eine Route absichtlich werfen lassen und
**echt abrufen**, dann steht in der Antwort, ob der Modulrahmen da ist. Fällt die Messung anders aus,
ist der Fehlertext trotzdem richtig, nur die Rahmung eine andere — die Entscheidung kippt daran nicht.
⚠️ Da `m/lagerbuch/layout.tsx` ohnehin nur `metadata.manifest` trägt (§7.1.1), ist der Unterschied
klein.

**Ausdrücklich NICHT: `m/lagerbuch/not-found.tsx`** (Entscheidung 36 (b)). Sie ruht auf genau der
Vorbedingung, die niemand gemessen hat, und sie hat keinen Kunden: die verbleibenden
`notFound()`-Würfe sind entweder Riegel (falscher Host, fehlende Gruppe, unbekannte Objekt-ID in der
Verwaltung), und für die ist die Suite-404 die richtige und bereits gehärtete Form —
`src/app/not-found.tsx:4-27` schreibt im Dateikopf aus, warum sie ohne Shell erscheint, und ihr
zweiter Absatz (`:41-46`) ist wörtlich für den Fall „darfst du nicht sehen" geschrieben worden.

**Diese Wahl ist mit Entscheidung 28 kohärent.** Der Helfer-Zweig trägt die öffentliche
Ansichtsklasse (§7.1), und genau deshalb sind seine Zustände *Zustände in der Seite* und keine
Grenzdatei: eine Suite-404 mit antd-Knopf mitten im Weg der Helferin wäre ein Bruch, den (b) nicht
vermeiden könnte.

**`loading.tsx`: keine, in keiner Route.** Weder lagerbuch noch die Suite hat eine. Alle
Einstiegsseiten sind `force-dynamic` (`g/[code]/page.tsx:8`, `(gate)/page.tsx:8`,
`a/[artikelId]/page.tsx:8`, `helfer/page.tsx:5`, `verwaltung/(admin)/journal/page.tsx:6`), jede
Navigation wartet also in beiden Welten auf denselben Server-Rundlauf. Eine Ladegrenze würde hier
nichts abkürzen, sondern eine zweite Anmutung erzeugen. **`global-error.tsx`** ist eine Wurzelfrage
und nicht Sache dieses Moduls.

### 11.3 Der gescannte Barcode — warum `/g/[code]` nicht 404 werden darf

`src/app/g/[code]/page.tsx:33` ruft `notFound()`, und das ist heute **richtiges** Verhalten: die
Rollen-Weiche davor (`:21-26`) schickt jede Nicht-Admin-Anfrage weg, mit Helfer-Sitzung nach `/helfer`
(`:24`), ohne Sitzung aufs Gate mit `returnTo` (`:25`). Wer `:33` erreicht, ist angemeldet und hat
gerade einen Geräte-Barcode gescannt, den weder `geraete` noch `bz_geraete` kennt (`:29-32`).

Nach einem unbesehenen Port sähe diese Person: die Suite-404 **ohne Shell und ohne Modulnavigation**
(`not-found.tsx:4-14`), einen Absatz, der von „dieser Suite" spricht und an „die Administration"
verweist (`:41-46`) — auf einem Host, der bis eben nur die Wortmarke des Moduls zeigte —, und keinen
Hinweis darauf, **welchen** Code sie eigentlich gescannt hat. Der einzige Rückweg, `href="/"`
(`:57`), führt immerhin richtig: relativ, also unter dem Host-Rewrite an den Modulanfang.

→ **`/g/[code]` antwortet künftig HTTP 200 mit einem gestalteten Zustand** in der Modul-Anmutung
(Entscheidung 8-C2): Überschrift „Kein Gerät zu diesem Barcode", der **gescannte Code im Klartext**
zur Kontrolle gegen das Typenschild, ein Knopf „Noch einmal scannen" auf `/verwaltung/geraete/scan`
und ein Knopf „Geräteliste". `notFound()` verschwindet aus dieser Datei.

**Und zwar im `_ui/VerwaltungsRahmen.tsx`, also mit Shell und Modulnavigation** (§2.9, §8.1 8-C2).
Das ist kein Zierrat, sondern der **erste** der drei oben genannten Mängel: „ohne Shell und ohne
Modulnavigation" ist ein Teil dessen, was hier repariert wird — `not-found.tsx:9-10` schreibt genau
das über sich selbst aus. Ein eigener, shell-loser Rahmen für diesen einen Zustand baute den Mangel
nach, statt ihn zu beheben. Die beiden benannten Wege (Scanner, Geräteliste) bleiben **im Zustand
selbst** stehen und werden nicht durch die Navigation ersetzt — §11.7 stützt sich darauf, dass jeder
gestaltete Zustand einen benannten Weg zurück trägt.

**Dieselbe Form löst Falle 27.** `src/app/a/[artikelId]/page.tsx:23` schickt heute eine Helferin, deren
Artikel-Deep-Link nicht auflöst, wortlos per `redirect("/helfer")` weg: sie hat ein Regaletikett
gescannt, landet auf der Startseite und erfährt nicht, warum. → HTTP 200, „Dieses Etikett gehört zu
keinem Artikel mehr. Bitte melde es der Verwaltung — der Aufkleber kann weg." (Entscheidung 8-C), mit
der gescannten Kennung und einem Weg in die Artikelliste des Helfer-Bereichs.

⚠️ **Das sind die zwei benannten Ausnahmen.** Alle übrigen Verwaltungs-Detailseiten mit unbekannter
ID behalten die Suite-404 (§11.5, Zustand 16) — dort steht kein Mensch mit einem gescannten
Gegenstand in der Hand, sondern eine Verwaltende, die einem veralteten Link gefolgt ist.

### 11.4 Was aus `pages.error: "/verwaltung/kein-zugriff"` wird

`src/auth.config.ts:72` macht `/verwaltung/kein-zugriff` zum `pages.error`-Ziel, und
`src/app/verwaltung/kein-zugriff/page.tsx:7-11` zeigt „Kein Zugriff — Dein Konto ist nicht in der
Gruppe für die Verwaltung. Wende dich an die Leitung." Die reale Kundschaft dieser Seite ist die
**abgewiesene Anmeldung**: `auth.config.ts:86-104` lässt den OIDC-Login nur durch, wenn die
Admin-Gruppe im Token steht (`:90`), und weist ihn sonst ab (`:101`) — ohne Gruppe entsteht heute nie
eine Sitzung.

**In der Suite gibt es diesen Weg nicht mehr.** Sie hat keinen `signIn`-Callback; jede Person mit
Pocket-ID-Konto bekommt eine Sitzung, gegatet wird erst danach. „Angemeldet ohne Lagerbuch-Gruppe" ist
nach dem Port nicht mehr der unerreichbare Rand, sondern der **Normalfall** — jede Person, die das
Portal benutzt und `/verwaltung` aufruft. Und `pages.error` gehört zu einer Auth.js-Konfiguration, die
lagerbuch nach dem Port gar nicht mehr führt (§2.7).

→ **Die Seite wandert nicht mit** (Entscheidung 10a, Option a; §3.3). Drei Gründe, in dieser
Reihenfolge:

1. Sie ist die **403-förmige Auskunft**, die die Suite ausdrücklich abgeschafft hat: „Bewusst 404
   statt 403: ein 403 verriete, dass es die Admin-Route gibt" (`core/auth/guards.ts:15-17`). Für eine
   Verwaltung mit Journal, Klarnamen und Etiketten voller Klartext-Codes ist das keine Formalie.
2. Die Optik kommt nicht mit: die Seite lebt von `.gate`/`.gatebrand`/`.gatesub` aus
   `src/app/globals.css:116-120`, die beim antd-Neubau ohnehin fallen. Es wäre ein Neubau, keine
   Übernahme.
3. Der Weg dorthin existiert nicht mehr (siehe oben).

**Was dabei verloren geht, ist nicht die Gestaltung, sondern die Benennbarkeit der Ursache** — und die
wird an genau einer Stelle wiederhergestellt, nicht an zweien: **der `console.warn` aus
`src/auth.config.ts:94-99` bekommt einen neuen Ort im modul-eigenen Zugriffsriegel** (§3.3). Er
protokolliert den erwarteten Gruppennamen und die tatsächlich im Token stehenden Gruppen, danach
`notFound()`. **Keine Kennung, keine E-Mail, kein Name in der Zeile** — dieselbe Form wie heute, und
einmal je Person je Prozess, weil der Riegel auf einem öffentlich erreichbaren 404-Pfad liegt.

**Die Einbuße für die Person vor dem Bildschirm wird bewusst hingenommen.** Der Log hilft ihr nicht,
und die Suite-404 nennt weder den Gruppennamen noch die Leitung. Der Gegenwert ist die Zusage aus
`guards.ts:15-17`, und die ist hier mehr wert.

### 11.5 Jeder benannte Fehlerzustand

„Anmutung" meint: **Modul** = gestalteter Zustand in der Seite, in der Anmutung, die Entscheidung 28
für den jeweiligen Bereich festlegt (§7.1 für den Helfer-Ast, antd für die Verwaltung) ·
**Suite-404** = `src/app/not-found.tsx`, ohne Shell · **Modul-Grenze** = `m/lagerbuch/error.tsx`.

| # | Zustand | HTTP | Was der Mensch sieht | Anmutung |
|---|---|---|---|---|
| 1 | Gate: Code nicht erkannt (`redeemToken` → `{ok:false}`) | 200 | Der Text zu `grund=code` aus §3.9, **am Feld**. Die Eingabe bleibt stehen | Modul |
| 2 | Gate: Fehlerbudget erschöpft (§3.5.3) | 200 | Der Text zu `grund=zuviele` aus §3.9 — mit der konkreten Wartezeit aus der lesbaren Sperrzeit, sonst „in einer Minute" | Modul |
| 3 | Gate: modulweite Bremse | 200 | Derselbe Text wie 2. Die beiden Bremsen sind für die Person nicht zu unterscheiden, und das ist Absicht — die Unterscheidung steht im Log | Modul |
| 4 | `/t/<code>` mit ungültigem Code | 303 → `/?grund=…` | **Die Weiterleitung trägt den Grund, und das Gate zeigt ihn.** Heute setzt `t/[code]/route.ts:21` `?err=code` — und `(gate)/page.tsx:10` liest den Parameter **nie** (Falle 60). → §3.9, §7.2.3 | Modul |
| 5 | `/t/<code>` gültig | 303 → Zielpfad | Landung im Helfer-Bereich; Cookie gesetzt, relatives `Location` (§7.2.3) | — |
| 6 | Helfer-Sitzung abgelaufen, schreibende Aktion | 200 | **Kein Absturz mehr.** `{ok:false, grund:"sitzung"}` → Panel „Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen." **plus Inline-Feld** (§7.4.4) | Modul |
| 7 | **Zugangs-Code während der Schicht gesperrt** | 200 | `{ok:false, grund:"gesperrt"}` → „Dieses Kärtchen wurde gesperrt. Die Buchung wurde **nicht** gespeichert." **Ohne** Inline-Feld. Heute ist das der einzige **getestete** Absturz: `e2e/helfer-flow.spec.ts:56` verlangt wörtlich `/server-side exception/` — der Absturz ist die erwartete Ausgabe, und die Helferin sieht eine englische Fehlerseite. Die Zusicherung wird umgeschrieben (§12.5) | Modul |
| 8 | **Entnahme gebucht: 0** | 200 | **Fehlfall, nicht Erfolg.** `{ok:false, grund:"leer"}` → „Im Handlager liegt nichts mehr von **X**. Bitte der Verwaltung melden." Heute ein **grüner** Chip mit Häkchen (`HelferEntnahme.tsx:26-27,55`). **Ein 200, das lügt, ist der teuerste Zustand dieser Tabelle** | Modul |
| 9 | Entnahme teilweise gebucht (`0 < gebucht < menge`) | 200 | `{ok:true}` mit `angefordert` — „**3 von 5** gebucht; mehr lag nicht im Handlager." Heute der grüne Chip mit der kleineren Zahl, ohne Hinweis | Modul |
| 10 | Netz weg mitten in Buchung oder Check | 200 | `grund:"netz"` → „Keine Verbindung. Die Buchung wurde **nicht** gespeichert." bzw. „…der Check wurde **nicht** gespeichert — nichts ist verloren, bitte erneut auf Abschließen tippen." Alle Client-Zustände bleiben stehen (§7.10.3) | Modul |
| 11 | Buchung/Aussonderung fachlich abgelehnt (die 22 Meldungstexte, u. a. `actions/aussondern.ts:26,28,37`, `actions/buchung.ts:35,66`, `db/barcode.ts:19,23`, `db/lagerort-verfall.ts:55`) | 200 | Der **deutsche** Text am Feld bzw. am Formular, über den Rückgabewert transportiert. Nie `e.message` — der zeigt in Produktion den englischen Satz (Falle 66) | Modul |
| 12 | Fahrzeug-Check: fremdes Objekt in der Nutzlast (`actions/check.ts:94,128,139,155`) | 500 → Grenze | Die vier Manipulationsfälle bleiben **Würfe** (§7.3). Kein Helfer erreicht sie über die Oberfläche | Modul-Grenze |
| 13 | Löschen abgelehnt, weil Historie vorhanden (`actions/loeschen.ts`) | 200 | Der Dialog bleibt offen, nennt den Grund und bietet **Deaktivieren** an — die heutige Aussage (`e2e/loeschen.spec.ts:67-74`), in der neuen Form | Modul |
| 14 | Löschen scheitert am Fremdschlüssel | 200 | Deutscher Satz „Dieser Eintrag hängt noch an anderen Daten und kann nicht gelöscht werden." **Nie** die rohe SQLite-Meldung. `openModuleDatabase` setzt `foreign_keys = ON` (§4.1) — der Fehler ist erreichbar, nicht hypothetisch, und mit den korrigierten Zählern (§5.21) selten | Modul |
| 15 | `/g/<code>`: Barcode unbekannt | **200** (heute 404) | §11.3, Entscheidung 8-C2 | Modul |
| 16 | Verwaltungs-Detailseite mit unbekannter ID (7 Stellen: `checks/[id]:13`, `vorlagen/[id]:15`, `sauerstoff/[id]:17`, `geraete/[id]:18`, `bz/[id]/kontrolle:19`, `fahrzeuge/[id]:23`, `bz/[id]:25`) | 404 | Suite-404. **Bewusst nicht gestaltet:** hier steht kein Mensch mit einem gedruckten Gegenstand, sondern eine Verwaltende, die einem veralteten Link gefolgt ist. Der Preis — Verlust von Shell und Modulnavigation — ist benannt und akzeptiert | Suite-404 |
| 17 | `/a/<id>`: Artikel unbekannt, Helfer-Sitzung vorhanden | **200** (heute wortloser Redirect) | §11.3, Entscheidung 8-C | Modul |
| 18 | `/a/<id>` ohne jede Sitzung | 303 → `/?returnTo=…` | Gate mit Rückkehrziel (`a/[artikelId]/page.tsx:19`) — **nie `/login`**. Das ist die Zeile, an der ein `requireLagerbuchAdmin()` in der Weiche sichtbar würde, und der Grund, warum dort ein Prädikat steht und kein Riegel (§3.2.1). Für `/g/<code>` ohne Sitzung gilt dasselbe (`g/[code]/page.tsx:25`) | Modul |
| 19 | Angemeldet, aber nicht in `SUITE_ADMIN_GROUP_LAGERBUCH` | 404 | Suite-404 **plus eine Logzeile** mit erwarteter und vorhandener Gruppe (§3.3, §11.4) | Suite-404 |
| 20 | Nicht angemeldet, Verwaltungspfad | 303 → `/login` | Suite-Login mit Rückkehrziel (§3.6.6) | Suite |
| 21 | Modulpfad auf einem **fremden** Suite-Host | 404 | Suite-404. Der modulinterne Host-Riegel (§2.6) schließt die Tür aus Falle 61 — `/m/lagerbuch/*` beantwortet sonst **jeder** terminierende Host, inklusive `/m/lagerbuch/t/<code>` mit seiner unumkehrbaren `lastUsedAt`-Nebenwirkung | Suite-404 |
| 22 | Server-Action-Riegel wirft (`core/auth/guards.ts:20-24`) | 500 → Grenze | Modul-`error.tsx`. Der Wurf **bleibt** ein Wurf: hier soll kein Text nach außen | Modul-Grenze |
| 23 | Unerwarteter Wurf im Render | 500 → Grenze | Modul-`error.tsx`: „Diese Ansicht konnte nicht geladen werden.", „Erneut versuchen", Weg zurück | Modul-Grenze |
| 24 | Journal-/Checks-Grenze hat gegriffen | 200 | „Es gibt mehr Treffer als angezeigt — bitte den Zeitraum eingrenzen." **Nur dann**, nicht unbedingt wie heute (`journal/page.tsx:32`). §5.14.3 | Modul |
| 25 | `von`/`bis` im Filter unlesbar | 200 | Heute der gefährliche Fall: die Grenze wird still verworfen, die Adresszeile zeigt einen Zeitraum, das Datumsfeld steht leer, und die Liste zeigt die neuesten 100 Buchungen der **ganzen** Historie. → Der unlesbare Wert wird **benannt** („Das Datum in der Adresse ist ungültig und wurde ignoriert.") statt still verworfen; `von > bis` bekommt einen eigenen Satz (§5.14.2) | Modul |
| 26 | Altes `checks.ergebnis`-Format | 200 | Hinweistext („Dieser Check stammt aus einer früheren Fassung und enthält keine Positionsdetails.") statt leerer Tabelle (§4.10) | Modul |
| 27 | `checks.ergebnis` unlesbar | 200 | `parseCheckErgebnis` liefert einen leeren V2-Wert; die Zeile wird als „Ergebnis unlesbar" gekennzeichnet statt als „0 Positionen" | Modul |
| 28 | Gelöschter Artikel/Gerät/Flasche im Check-Snapshot | 200 | „(gelöschter Artikel)" u. a. (`queries.ts:442`, `:461`, `:473`) — bleibt wörtlich | Modul |
| 29 | Flasche ohne Messung | 200 | „keine Messung" — **nie** „0 %" (§5.12) | Modul |
| 30 | Nennfülldruck unbekannt | 200 | `null` + „Nennfülldruck unbekannt", **keine** Prozentzahl, **keine** Ampel; zählt in „nicht bewertbar" (§5.12) | Modul |
| 31 | BZ nie geprüft | 200 | eigener Text „noch nie geprüft" — `ueberfaellig === false` ist hier **kein** ok (§5.11) | Modul |
| 32 | Gerät ohne Datum | 200 | grau + „kein MTK-Datum"; bei `objekt` **kein** Chip (§5.10) | Modul |
| 33 | Nachfüllen, Handlager leer | 200 | der Abschlussbildschirm nennt „N Stück weiterhin offen (Handlager leer)" bzw. „Von N bestätigten Teilen konnten nur M gebucht werden" (§7.9.4) | Modul |
| 34 | Aussondern einer nicht abgelaufenen Charge / ohne Handlager-Rest | 200 | Rückgabewert mit dem heutigen Text; der Text nennt **Handlager** ausdrücklich, sonst wirkt es falsch, wenn im Fahrzeug noch Rest liegt (`aussondern.ts:28,37`) | Modul |
| 35 | Kein aktives Fahrzeug angelegt / Fahrzeug ohne Soll, Geräte, Flaschen | 200 | „Keine Fahrzeuge angelegt. …" bzw. „…nichts zu prüfen." — 1:1, jetzt serverseitig gerendert (§7.9.1) | Modul |
| 36 | Kamera verweigert (nur Verwaltung) | 200 | vier unterscheidbare Zustände statt einem (§7.6.3) | Modul |
| 37 | Leerzustände (keine Buchung, kein Gerät, kein Check, kein Bestellvorschlag) | 200 | Satz plus nächster Schritt, nie eine leere Fläche. Heute gibt es sie teilweise (`journal/page.tsx:37`) — sie sind Pflicht, auch für die Kacheln | Modul |
| 38 | Etikettenbogen ohne konfigurierte Domain | 200 | „Etiketten können nicht gedruckt werden: für lagerbuch ist keine öffentliche Domain konfiguriert (SUITE_HOST_LAGERBUCH)…" statt eines Bogens mit toten QR (Entscheidung 8-B) | Modul |
| 39 | Zwischenablage ohne secure context | 200 | Modal mit demselben Text zum Markieren (Entscheidung 9-D) | Modul |
| 40 | Auflöser findet die Kennung nicht | 200 | rohe ID (`quelle.ts:24`). Unter der gefilterten `users`-Übernahme (§4.13) tritt das für **historische** Zeilen nicht ein; für neue Zeilen ist es der benannte Defektzustand aus §4.13 (i) und wird protokolliert | Modul |

### 11.6 Farbe, Symbole und die Fallen, die `pnpm build` nicht findet

**Rot trägt in diesem Modul fachliche Bedeutung** — die Verfall-Ampel, die Gerätefälligkeit, die
BZ-Fälligkeit, das negative Journal-Delta. Und `colorError === colorPrimary === #c8000f`
(`CLAUDE.md:16-17`). Daraus folgt für jeden Zustand dieser Tabelle:

- **Kein `Alert type="error"` auf einer Datenfläche.** Er sieht aus wie eine Primäraktion und
  konkurriert zusätzlich mit der Ampel um dieselbe Farbe. Fehler tragen `type="warning"` oder Text
  plus 3px linke Kante.
- **Jeder Zustand trägt Text, nie Farbe allein.** Das gilt für die Ampel ebenso wie für die
  Fehlerzustände (§5.17).
- **`size` wird nicht gesetzt** — `controlHeight: 56` ist die Vorgabe und schon das richtige Maß;
  `size="large"` wäre 72px (`CLAUDE.md:18-19`). ⚠️ Genau **eine** Ausnahme, und sie ist die der
  Suite: Zeilenaktionen **innerhalb einer Tabellenzeile** tragen `size="small"`
  (`docs/design/README.md:61-62`, §6.4.1 Punkt 4).
- **Eingabefelder unter 16px gibt es nicht** (§7.7.2 für den Helfer-Weg, §6.7.3 für die Verwaltung —
  dort auch die zwei Lücken im Suite-Riegel `feldschrift.test.ts`). Das Gate-Codefeld und die Zähl-Zeilen sind die
  gefährdeten Stellen; `globals.css:113` führt heute ein `.verfallfeld .input{…font-size:13px}` — das
  wandert **nicht** mit.

**Zwei Fallen treffen die Grenzdateien und die gestalteten Zustände direkt, und keine davon sieht ein
Gate:**

- **`@ant-design/icons` in einer Server Component ergibt HTTP 500 — und `"use client"` behebt das
  nicht, es macht es still** (`CLAUDE.md:28-41`). Ein Häkchen oder ein Warndreieck in
  `error.tsx`, im Barcode-Zustand oder im Sperr-Panel ist genau die Stelle, an der man reflexhaft ein
  Icon importiert. Diese Zustände tragen **Inline-SVG** aus `_ui/ikonen.tsx` (§7.7.4, §6.5.1 — die
  Regel gilt modulweit und ausdrücklich auch für Client-Inseln) oder eine Client-Insel;
  `next/dynamic` mit `ssr: false` ist keine Abhilfe, weil der Import schon beim Laden des Moduls
  scheitert. `src/core/shell/icons.test.ts` riegelt den Import repo-weit ab — was der Test **nicht**
  abdeckt, ist ein modul-eigenes Blatt, das die Icons re-exportiert.
- **Ein `WERT` aus einem `"use client"`-Modul kommt in einer Server Component nicht an**
  (`CLAUDE.md:24-27`). Die Zustandstexte dieser Tabelle liest sowohl eine Server Component
  (`/g/[code]`, `/a/[artikelId]` sind Server Components) als auch eine Client-Insel (das Sperr-Panel
  im Helfer-Weg). Sie gehören deshalb in ein Modul **ohne** `"use client"` unter `_lib/` — dieselbe
  Regel wie für die Zahlen aus §10.3. TypeScript ist zufrieden, `build` findet nichts, und Vitest
  kann es strukturell nicht finden.

### 11.7 Die beiden Prüffragen aus `docs/design/README.md:236-249`, die Fehlerzustände betreffen

**Kommen Fehler aus Server Actions am Feld an?** Ja — das ist genau (d) aus §11.2. Formularfehler über
`useActionState` am Feld, Zeilenfehler an der Zeile, Sitzungs- und Sperrfälle als Panel an der Stelle,
an der die Person gerade steht. Heute rendern 12 von 34 Aufrufstellen `e.message` an Ort und Stelle
(`InventurForm.tsx:26-31`, `CheckFlow.tsx:142-159`, `ArtikelDrawer.tsx:68-77`) — **auch diese zwölf
werden umgestellt**, denn `e.message` ist in Produktion der englische Satz. Die Fehlerform ist der
Rückgabewert, nicht der gefangene Wurf. Ein Quelltext-Scan „keine `e.message`-Anzeige unter
`m/lagerbuch`" hält die Bauform fest (§12.6, Punkt 5).

**Führt jede Seite zurück?** Jeder gestaltete Zustand aus §11.5 trägt mindestens einen benannten Weg:
in die Liste, auf den Scanner oder aufs Gate. Die Suite-404 trägt `href="/"` und führt unter dem
Host-Rewrite an den Modulanfang (`not-found.tsx:48-56`). ⚠️ **Wohin das führt, ist mit Entscheidung 15
festgelegt** (§3.6.6): der Modulanfang ist das Gate, und eine angemeldete Person ohne
Lagerbuch-Gruppe bekommt dort ein Token-Feld angeboten, das ihr Problem nicht löst — **neben** dem
Verwaltungs-Knopf, der sie zum Login führt. Das ist der bewusst hingenommene Preis von §11.4.
---

## 12. Testaufbau — wer welche Aussage besitzt

Die kapitelspezifischen Testtabellen stehen bei ihren Kapiteln (§3.8, §4.16, §5.19, §7.12, §8.5,
§9.6). Dieses Kapitel legt die **Ebenen**, die **Selektorregel**, die **Prüflücken** und die
**Randbedingungen** fest — und was aus den 13 Alt-Specs wird.

### 12.1 Die Trennlinie, die der Bestand hinterlässt

Nachgezählt am Arbeitsbaum: **44 Testdateien unter `src/`, alle `.ts`, keine einzige `.tsx`** — und
damit kein DOM-Harness im ganzen Bestand. 13 Playwright-Specs unter `e2e/` (die vierzehnte Datei,
`e2e/migrate-db.ts`, ist ein Seed-Helfer). Daraus folgt die harte Trennlinie: **was an der Oberfläche
passiert, prüft heute ausschließlich Playwright.**

Unter jeder *serverseitigen* Zusage der 13 Specs liegt ein Unit-Test — mit genau einer Ausnahme
(`gate.spec.ts`, das gar keine macht). **Sieben Zusicherungen sind dagegen die einzige Absicherung
ihrer Fachlichkeit**, und alle sieben sind vom Typ „ein serverseitig gerechneter Wert wird richtig
angezeigt bzw. eine Eingabe wird richtig verdrahtet". Das ist die Liste, für die ein **ersetzender**
Test geschuldet ist, **bevor** die alte Spec gelöscht wird — für alles andere genügt es, die Spec neu
zu schreiben oder fallenzulassen, weil die Fachlichkeit unter `src/` weiterhin gegatet ist.

| # | Aussage ohne Netz | Wer sie im Neubau besitzt |
|---|---|---|
| 1 | Das Verfallsfeld im Zählschritt (`CheckFlow.tsx:281`) wandert in die Check-Nutzlast, und die Live-Vorschau `{n} laufen ab` (`:306`) zählt mit. `actions/check.test.ts:229` beweist nur, dass der Server richtig zählt, **wenn** der Wert ankommt | **Unit** — die Nutzlast-Bildung wird aus der Komponente in `_lib/checkNutzlast.ts` (ohne `"use client"`) gehoben: „aus Zählwerten und gemeldeten Verfällen entsteht diese Nutzlast", inklusive der Vorbelegung `ist[p.id] ?? p.soll` (§5.8.1) und der Zählung der ablaufenden Positionen. **DOM** — das Feld ist verdrahtet und die Vorschau ändert sich beim Tippen. **E2E** — der Wert überlebt bis in die Datenbank |
| 2 | Der clientseitige Artikelfilter. Das Prädikat steht als `useMemo` **inline** in `ArtikelTable.tsx:112-123` — es gibt nichts, was ein Unit-Test importieren könnte. Nebenbefund: es sucht über Name, Fach **und** Chargennummer (`:119`), die Spec probiert nur den Namen | **Unit** — das Prädikat wandert nach `_lib/artikelFilter.ts`, mit je einem Fall für alle drei Felder. **Unit dazu** — die Kopplung: `bestandExportZeilen(gefiltert)` (`ArtikelTable.tsx:133`) bekommt **dieselbe** abgeleitete Liste; sonst exportiert der Knopf still wieder alles, sobald Filtern in antds `Table`-eigenen Zustand wandert (§9.4) |
| 3 | Die Entprellung, die den Tastendruck als `?q=` in die URL schreibt (`JournalFilter.tsx:44-52`) — der Serverfilter dahinter ist getestet (`db/queries.test.ts:142-167`), die Verdrahtung nicht | **DOM** mit gefälschter Uhr: nach *einer* Tipppause **ein** Schreibvorgang, nicht sechs. Dazu der `committedQ`-Tanz (`JournalFilter.tsx:29-36`): eine **externe** `q`-Änderung zieht das Feld nach, eine selbst ausgelöste nicht — sonst verliert das Feld beim Tippen den Fokus. **E2E** besitzt nur, dass `?q=` tatsächlich in der Adresse steht |
| 4 | `.jdelta.minus` (`verwaltung-flow.spec.ts:67`): eine Entnahme erscheint im Journal negativ **und** abgesetzt | **Unit** — die Aufbereitung einer Journalzeile liefert Vorzeichen und einen Zustandsnamen (`negativ`), `_lib/journalZeile.ts`. **DOM** — die Zeile rendert beides. Die Zusicherung nennt **nie einen Hexwert**: ob Rot auf dieser Datenfläche bleiben darf, entscheidet Entscheidung 30 (§6.6.2 — und sie entscheidet **Ampel**-Rot `#8c0d16`, nicht Suite-Rot), und ein Test, der `#c8000f` festnagelt, entscheidet sie versehentlich mit |
| 5 | Der Chip `bestellt` als Zeilenzustand, bewusst mit `exact: true` von der Fußnote getrennt (`inventur.spec.ts:29` → `BestellListe.tsx:55`) | **DOM** — die Zeile eines bestellten Artikels trägt den Zustand, die Fußnote ist ein anderer Knoten. ⚠️ Der Text ändert sich zu „bestellt seit &lt;Datum&gt;" (§5.5); die Zusicherung wandert mit dem Text, nicht gegen ihn |
| 6 | `Endgültig löschen` bleibt gesperrt, bis der Name exakt getippt ist (`loeschen.spec.ts:50-54`). `actions/loeschen.test.ts:38-190` prüft die serverseitige Verweigerung, nicht den gesperrten Knopf | **DOM** — `fill` mit falschem Namen → Knopf bleibt `disabled`; `fill` mit exaktem Namen → freigegeben. Das ist eine reine Client-Zusage und gehört nicht in einen E2E |
| 7 | Der von `etikettenDaten` erzeugte Data-URI landet im Bogen als `<img src>` (`etiketten.spec.ts:11-13`). Die Daten selbst sind gegatet (`db/etiketten.test.ts:8`) | **DOM** — n Zeilen ergeben n QR-Knoten. ⚠️ Der Träger wechselt von `<img src="data:…">` auf ein eingesetztes `<svg>` (§8.4, Entscheidung 8-I); die Zusicherung wandert auf `.lb-etikettQr > svg`. Die **Millimeter** besitzt kein Test: sie gehören in den Quelltext-Scan über `druck.css` und in einen echten Probedruck im Runbook |

**Punkt 4, 5 und 7 hängen an eigenem Markup und gehen beim antd-Umbau sicher kaputt; 1, 2, 3 und 6
hängen an Rollen und Beschriftungen und gehen kaputt, sobald die Bauteile ersetzt werden — was für
`Stepper`, `Filterleiste` und die Tippbestätigung der Zweck der Übung ist.**

### 12.2 Die drei Ebenen und was sie besitzen

**Unit (Vitest, `environment: "node"`) — reine Funktionen.** Alles, was heute unter `src/` getestet
ist, zieht mit; die Dateien wandern nach `src/app/m/lagerbuch/_lib/*.test.ts` bzw. `_db/*.test.ts`.
Die vollständigen Listen stehen in §3.8.1, §4.16, §5.19.1, §7.12.1, §9.6. Zwei Dateien, die
sonst keinem Kapitel gehören:

| Datei | Besitzt die Aussage |
|---|---|
| `_lib/grenzen.test.ts` | Jede Pflichtvariable fehlt → Fehler nennt **Name und Einheit**. Die drei Kopplungen aus §10.5 greifen in **beide** Richtungen. `ROT > GELB` wird abgelehnt, `ROT = GELB` erlaubt. Ein Wert wie `0x10` oder `1e7` wird abgelehnt, nicht als 16 bzw. 10000000 gelesen. Ohne Prod-Host ist die Fehlerliste **leer**. **Die Erwartungstabelle steht im Test, nicht im Modul** — sonst prüft der Test den Code gegen sich selbst und bleibt auch bei falscher Einheit grün (§10.8, Punkt 2) |
| `_lib/boot.test.ts` | fehlendes, **leeres**, zu kurzes, Vorgabe- und mit `AUTH_SECRET` identisches `LAGERBUCH_HELFER_SITZUNG_SECRET` → je eine benannte Meldung; gesetztes `SUITE_ACCESS_GROUP_LAGERBUCH` → Meldung; fehlendes `SUITE_ADMIN_GROUP_LAGERBUCH` → Meldung; **ohne Prod-Host keine einzige** |

**DOM (Vitest, jsdom) — mit dem etablierten Harness.** `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`hydrate`/`rerender`/`unmount`/`query`/`queryAll`/`exists`/`fill`/`click`/`clickElement`/
`submitForm`/`queryPortal`/`existsPortal`/`clickPortal`, Exporte ab `:24`). **Kein zweites erfinden**
(`CLAUDE.md:106-107`).

⚠️ **Der in der `files`-Spec §11.4 benannte Hebungs-Auslöser ist längst gefallen, und das gehört
ausgesprochen statt umgangen.** Nachgezählt importieren heute **drei Module plus `core`** aus
`qr/_lib/test-dom`: `m/qr` (7 Dateien), `m/feedback` (10), `m/files` (11), dazu
`src/core/shell/SuiteNav.test.tsx:13` und `src/components/providers.test.tsx:4`. Die Bedingung
„sobald ein drittes Modul es braucht" ist mit `files` erfüllt worden, die Hebung nach
`src/core/test-dom.tsx` ist nicht erfolgt.
→ **Festlegung: lagerbuch importiert wie die anderen aus `@/app/m/qr/_lib/test-dom`. Die Hebung wird
in dieser Spec NICHT durchgeführt.** Sie berührt über dreißig Importzeilen in drei fremden Modulen
und `CLAUDE.md:106-107`, bringt lagerbuch keinen Nutzen und machte aus einem Modul-Port eine
repo-weite Umbenennung mitten in einer Cutover-Vorbereitung. Sie gehört als eigener, benannter
Suite-Posten protokolliert (§15) — **nicht** still über eine Modul-Spec eingeführt, und ebenso wenig
still weiter übergangen.

Die DOM-Aussagen stehen in §7.12.3 und §5.19; zusätzlich gilt für alle:

| Test | Zusage |
|---|---|
| `_ui/Gate.test.tsx` | `Gate` nimmt die **fertige Meldung** entgegen, nicht den Rohparameter (`meldung`-Prop, §7.2.4): die vier Sätze aus §3.9 — je einmal über `gateMeldung` erzeugt — erscheinen als Text am Feld, `null` rendert keinen Fehlerort; die Eingabe bleibt stehen; das Feld trägt `inputMode="numeric"`, `maxlength="7"` und das `pattern` |
| `_ui/*.test.tsx` | Leerzustände jeder Liste; jeder Ampel-Zustand trägt **Text**, nicht nur Farbe |
| `error.test.tsx` | Die Modul-Grenze rendert Text, „Erneut versuchen" und einen Weg zurück — **und keinen Icon-Import** |

**Was jsdom strukturell nicht kann: Media Queries auswerten.** Ein Vitest, der „auf 390px ist X
unsichtbar" behauptet und dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne
Balken ist eine Lüge (`docs/design/README.md:199-206`). Vitest besitzt hier nur die Aussage
**„die Klasse trägt die richtige Media Query"** als Quelltext-Scan über das Modul-CSS. Der Scan
sichert zu, dass in `max-width`-Abfragen des Modul-CSS **kein anderer Wert als 767.98px** steht —
nicht 768, sonst gelten bei exakt 768px beide Seiten und die Reihenfolge im Stylesheet entscheidet
(`README.md:195-197`) — und dass `_ui/helfer.module.css` **gar keine** hat (§7.7.1). ⚠️ lagerbuch
schaltet heute bei **760px** (`globals.css:250`); das ist genau der Fall, den `feedback` bis zum
27.07. hatte, und er ist an beiden Enden unsichtbar.

**E2E (Playwright) — was NUR e2e belegen kann.**

| Zusage | Warum nur e2e |
|---|---|
| Der Helfer-Weg am Stück: Code am Gate → `/helfer` → Entnahme → Journal zeigt die **Token-Provenienz** (Label statt Person, roher Code im `title`) | Cookie über drei Routen, Rollen-Weiche im echten Request |
| **Ein gesperrter Code wird sofort abgewiesen — und die Person sieht eine deutsche Meldung, keinen Absturz** | ersetzt `e2e/helfer-flow.spec.ts:56`; §12.5 |
| `/t/<code>` setzt das Cookie auf **demselben** Host, auf dem die Landung passiert, Status 303 | Falle 16: weicht die Basis vom Anfrage-Host ab, ist der Redirect cross-origin, die Helferin kommt ohne Sitzung am Gate an — **und der Code bleibt gültig, hinterlässt aber eine `lastUsedAt`-Spur**, die man nicht mehr wegbekommt |
| **Jede Route des Moduls antwortet auf einem FREMDEN Suite-Host mit 404** — eine Schleife über alle Einstiege, nicht zwei Stichproben | Falle 61. Route Handler haben kein Layout; ohne diese Schleife bliebe die Mutation „den Host-Abgleich in `/t/[code]` weglassen" grün, und `/m/lagerbuch/t/<code>` verbrauchte Codes von jedem terminierenden Host aus. **`tokens.last_used_at` ist danach nachweislich `NULL`** |
| **`aria-current` in der Modulnavigation und in der Helfer-Tab-Leiste** (§7.8.2) | Vitest ist hier **strukturell** blind: `core/shell/SuiteNav.test.tsx:48` mockt `usePathname`, und der Test sagt das über sich selbst (`:263-266`). Vorbild `e2e/shell-mobil.spec.ts:288-324`, das auch die Gegenrichtung prüft |
| Der Excel-Export liefert wirklich eine Datei: Name in der Form `bestand-JJJJ-MM-TT.xlsx`, ZIP-Magic `PK` | Die Bibliothek wird beim Klick nachgeladen; das sieht nur ein Browser (§9.6) |
| Der Etikettenbogen druckt ohne die übrige Oberfläche | `@media print` wirkt nur im Browser |
| Mobile Zusagen bei **390×844, 1280×720 und dazwischen (834×1112)** | jsdom kann es nicht — und **wer nur die Enden misst, prüft die Mitte nicht**; die Mitte ist jedes Tablet im Hochformat (`README.md:199-212`). Der Desktop-Lauf ist keine Zugabe: ein Test, der nur bei 390px misst, kann eine `display:none`-Regel gar nicht widerlegen |

Dateien: `e2e/lagerbuch-helfer.spec.ts`, `e2e/lagerbuch-verwaltung.spec.ts`,
`e2e/lagerbuch-etiketten.spec.ts`, `e2e/lagerbuch-hosts.spec.ts`, `e2e/lagerbuch-mobil.spec.ts`,
`e2e/lagerbuch-bestand-export.spec.ts`.

### 12.3 Die Selektorregel im Neubau

**Rollen und Beschriftungen, keine Klassen.** Achtundzwanzig Selektor-Verwendungen der 13 Alt-Specs
hängen an eigenen CSS-Klassen und sterben am antd-Umbau: `.drawer` 8×
(`loeschen.spec.ts:21,33,43,63`, `verwaltung-flow.spec.ts:26,40,55,61`), `tr.click` 5×
(`loeschen.spec.ts:32,42,62,73`, `verwaltung-flow.spec.ts:39`), `.card.journal .row` 3×
(`loeschen.spec.ts:37`, `verwaltung-flow.spec.ts:51,57`), `.row` 3×
(`verfall.spec.ts:15,24`, `helfer-flow.spec.ts:44`), `.modalbox` 2× (`loeschen.spec.ts:46,66`),
`div.grid2 input.input` 2× (`loeschen.spec.ts:24`, `verwaltung-flow.spec.ts:32`),
`table.tbl tbody tr` 2× (`helfer-flow.spec.ts:26`, `verwaltung-flow.spec.ts:65`), `a.row` 1×
(`helfer-flow.spec.ts:12`), `.jdelta.minus` 1× (`verwaltung-flow.spec.ts:67`), `.etikett img` 1×
(`etiketten.spec.ts:11`). Dazu zwei Attributselektoren mit derselben Kopplung ans eigene Markup:
`input[type="month"]` 2× und `[title="111-111"]` 1×.

⚠️ **Korrigiert: keiner davon überlebt.** Hier stand, `input[type="month"]` überlebe bewusst, weil
§7.7.2 Punkt 4 das native Feld festschreibt. Das trägt nicht: §7.7.2 lässt das Feld des
**Fahrzeug-Checks** nativ (`CheckFlow.tsx:280`), während **beide** Fundstellen
(`loeschen.spec.ts:35`, `verwaltung-flow.spec.ts:45`) innerhalb von `page.locator(".drawer")` stehen
und damit `ArtikelDrawer.tsx:307` greifen — ein **Verwaltungs**-Feld. Die drei Verwaltungs-Monatsfelder
bekommen antd-Ersatz (§4.6), und ein `DatePicker picker="month"` rendert kein `<input type="month">`.
Der Ersatzanker ist `getByLabel("Verfallsmonat")`; die vollständige Ersetzungstabelle steht in
**§6.11**.

**Die Gegenstücke je Selektor** — welcher Anker an welche Stelle tritt — stehen in **§6.11**; nur
dort ist bekannt, was künftig an der Stelle steht. Hier stehen die fünf Regeln, unter denen sie
ersetzt werden, und die ersten beiden sind die, an denen es tatsächlich schiefgeht:

1. **Antds interne Klassen sind kein Ersatz.** Wer `.drawer` auf `.ant-drawer-body` umbiegt, tauscht
   eine Kopplung gegen eine schlechtere — antds Klassennamen sind kein Vertrag. Die Suite geht diese
   Kopplung an **genau einer** Stelle bewusst ein, mit ausgeschriebener Begründung
   (`src/app/globals.css:60-71`, `:root .ant-select-selector`, „der Bruch wäre still"). Es
   bleibt bei einer. **Ersatz sind `data-testid` oder Rollen.**
2. **Eine Rollen-Zusicherung verpflichtet zur Gegenprobe am Ersatz.** `suche-filter.spec.ts:15,28`
   greift `role=searchbox` — und diese Rolle entsteht **allein** aus `type="search"`
   (`Filterleiste.tsx:106`). Wer das Bauteil ersetzt und nur `placeholder`/`label` mitnimmt, bekommt
   `textbox`; **beide** Tests brechen an derselben Stelle, und zwar still im Sinne von „Selektor
   findet nichts", nicht „Fachlichkeit kaputt". Jede Rollen-Zusicherung im Neubau wird deshalb einmal
   gegen das gerenderte Bauteil geprüft, nicht gegen die Absicht.
3. **Ein neu geschriebener Nachfolgetest, der grün läuft und etwas anderes prüft als vorher, ist
   schlimmer als ein roter.** Jede der sieben Aussagen aus §12.1 wird beim Umschreiben namentlich
   gegen ihre alte Fassung gehalten.
4. **Kein `.first()` und keine Zusicherung, die an der Reihenfolge früherer Specs hängt.** Playwright
   fährt alle Dateien in **einem** Worker gegen **eine** SQLite-Datei; die
   `.first()`-Zusicherungen des Bestands (`inventur.spec.ts:13`, `check.spec.ts:22`,
   `helfer-flow.spec.ts:12`) hängen damit an der angesammelten Reihenfolge aller vorher gelaufenen
   Specs. Der benötigte Zustand wird **im Test selbst** hergestellt
   (`docs/design/README.md:214-220`).
5. **Keine defensiven Übersprünge.** `inventur.spec.ts:26` ist als `if (await firstToggle.count())`
   geschrieben und liefe ohne Bestellvorschlag **grün ohne Zusicherung** durch; heute rettet das
   allein ein Fixture. Wandert der Seed nicht mit, wird der Test still wirkungslos statt rot — die
   schlechtere der beiden Varianten. Fehlt eine Voraussetzung, wird der Test rot.

### 12.4 Was strukturell kein Test finden kann → ein echter Abruf je angefasster Route

Vier Fehlerklassen sind für `pnpm build`, `pnpm typecheck`, `pnpm lint` **und** Vitest strukturell
unsichtbar. Für sie schuldet die Spec keinen Test, sondern einen **Abruf gegen einen laufenden
Server**:

| Klasse | Warum kein Gate sie sieht | Symptom |
|---|---|---|
| **Compound-Zugriff auf antd in einer Server Component** (`Typography.Title`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Input.TextArea` …; `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` sind sicher) | `CLAUDE.md:11-13` | HTTP 500 für die ganze Seite |
| **`@ant-design/icons` in einer Server Component** — und `"use client"` behebt das nicht, es macht es still | `CLAUDE.md:28-41`. Der nackte Spezifizierer löst über `exports["."].node.import` auf CJS auf, das `createContext` auf **Modulebene** ruft; in der RSC-Ebene gibt es das nicht → Fehler **schon beim Import**. `core/shell/icons.test.ts` riegelt den Import repo-weit ab; ein modul-eigenes Blatt, das re-exportiert, sieht er nicht | HTTP 500 beim Import; mit `"use client"` auf der Icon-Datei stattdessen HTTP 200 mit **leerer** Map und still falschem Icon |
| **Ein WERT aus einem `"use client"`-Modul in einer Server Component** | `CLAUDE.md:24-27`; Vitest kann es strukturell nicht sehen, dort ist `"use client"` ein wirkungsloser String | HTTP 500 für die ganze Seite |
| **`usePathname` unter dem Rewrite** | `core/shell/SuiteNav.test.tsx:48` mockt `next/navigation`, und `:263-266` sagt das über sich selbst. Die vorhandene Messung steht gegen Next **16.2.6** (`SuiteNav.tsx:92`), die Suite fährt **16.2.11**, und sie entstand per `curl` gegen einen Dev-Server **ohne** Reverse-Proxy | Keine oder falsche Aktivmarkierung — sieht nicht kaputt aus, nur unaufmerksam. ⚠️ Im Modul kommt `usePathname` gar nicht vor (§7.8.2), aber die `href`-Auflösung hat dieselbe Naht |

**Die Auflage.** Jede Route, die der Port anfasst, wird **einmal echt abgerufen** — Dev-Server auf
dem Modul-Host, HTTP-Status und ein unterscheidendes Merkmal je Route protokolliert. Das sind alle
**29** `page.tsx` des Moduls (Gate, `/g`, `/a`, zwei Helfer-Seiten, 23 unter `(arbeit)`, der
Etikettenbogen) plus die sieben Route Handler; die Liste gehört in die Bau-Task und wird abgehakt,
nicht behauptet. Mindestens:

`/` (Gate) · `/helfer` · `/helfer/check` · `/a/<bekannt>` · `/a/<unbekannt>` · `/g/<bekannt>` ·
`/g/<unbekannt>` · `/t/<gültig>` · `/t/<ungültig>` · `/verwaltung` · `/verwaltung/artikel` ·
`/verwaltung/journal` · `/verwaltung/checks` · `/verwaltung/checks/<id>` · `/verwaltung/inventur` ·
`/verwaltung/bestellung` · `/verwaltung/etiketten` · `/verwaltung/tokens` · `/verwaltung/fahrzeuge` ·
`/verwaltung/fahrzeuge/<id>` · `/verwaltung/vorlagen` · `/verwaltung/vorlagen/<id>` ·
`/verwaltung/geraete` · `/verwaltung/geraete/<id>` · `/verwaltung/geraete/scan` · `/verwaltung/bz` ·
`/verwaltung/bz/<id>` · `/verwaltung/bz/<id>/kontrolle` · `/verwaltung/bz/scan` ·
`/verwaltung/sauerstoff` · `/verwaltung/sauerstoff/<id>` · `/verwaltung/import` ·
`/verwaltung/verfall` · `/manifest.webmanifest` · `/icon-192.png` · `/api/health/lagerbuch` ·
**eine absichtlich werfende Route** (Nachweis der `error.tsx`-Rahmung, §11.2).

**Zwei Ausprägungen kommen mit §6 dazu, und beide sind Abrufe, keine Tests** (§6.14):

1. **Je ein Abruf pro Farbmodus** auf `/verwaltung/artikel` (Tabelle), `/verwaltung/verfall`
   (Plakette und Chips) und `/verwaltung` (KPI-Kacheln). **Kein Gate der Suite rendert ein Modul im
   Dunkelmodus** (§6.6.7), und alle acht fest gegen Hell gebauten Stellen sind syntaktisch
   einwandfrei.
2. **Ein Abruf mit `page.emulateMedia({ media: "print" })`** auf `/verwaltung/etiketten`: abgewählte
   Kachel unsichtbar, Auswahlkästchen unsichtbar, Suite-Kopfzeile unsichtbar (§6.10.2). Playwright
   rendert per Vorgabe für den Bildschirm; `pnpm build` und Vitest sehen `@media print` gar nicht.
   **Dazu der Riegel:** `/verwaltung/etiketten` **ohne** Lagerbuch-Gruppe muss dieselbe Antwort geben
   wie `/verwaltung/artikel` ohne Gruppe — die einzige Zusicherung, die die Kopplung zwischen den
   beiden Group-Layouts prüft, und ein Quelltext-Scan sieht sie nicht (§6.1.3).

**Eine Route ist heute in gar keinem E2E enthalten** und deshalb doppelt zu beachten: Falle 32 hält
fest, dass **kein einziger** Spec des Bestands die gescannte Route `/g/<code>` abdeckt — der
Scan-Einstieg auf ein Gerät ist unbezeugt. `/a/<id>` kommt zwar vor (`helfer-flow.spec.ts:52`), aber
als **Deep-Link**, nie als Scan-Einstieg; der Weg über den Kamera-Scan bleibt damit ebenfalls
unbezeugt.

### 12.5 Was aus den 13 Alt-Specs wird

| Alt-Spec | Fate |
|---|---|
| `bestand-export.spec.ts` | **Übernehmen**, Rolle+Name sind antd-neutral. ⚠️ Die Zusicherung prüft nur die **Form** des Dateinamens (`:18`), nie den **Wert**; `lib/bestand-export.test.ts:44` konstruiert aus lokalen Komponenten und liest über lokale Getter zurück — grün unter jeder Zone. Der Dateiname entsteht im Browser (§9.4), also bleibt die Lücke bestehen und ist benannt |
| `bz-scan.spec.ts` | **Umschreiben.** Rollen und URL-Muster überleben; die vier `getByPlaceholder`-Anker (`:19,20,29,40`) nicht, sobald Felder auf `Form.Item label` umgestellt werden. Der Hydrations-Retry (`:41-47`) ist ein reines `next dev`-Artefakt und entfällt |
| `check.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkt 1). `/abschließen/i` trifft heute case-insensitiv genau einen Knopf, weil je Phase nur einer rendert; `Stepper` ist eigenes Markup und geht als Ganzes mit (§7.7.3) |
| `etiketten.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkt 7). Der QR-Träger wechselt von `<img>` auf `<svg>` (§8.4) |
| `gate.spec.ts` | **Ersetzen.** Die Aussage „login-freie Startseite" bleibt; der Zuschnitt folgt §3.6.6 und §3.9 |
| `geraete.spec.ts` | **Teilen.** `:66` (`button "Defekt"`) ist die **Eingabe**seite und überlebt einen Umbau auf `Radio.Group`/`Select` nicht; `:80` (`getByText("Defekt")` auf der Check-Detailseite) prüft das **persistierte** Literal und überlebt. `combobox "Standort"` (`:23-24`) bricht mit `Combobox.tsx:182,223`, das `role="combobox"`/`role="option"` von Hand setzt |
| `helfer-flow.spec.ts` | **Umschreiben, und zwar fachlich, nicht nur im Selektor.** Drei CSS-Kopplungen plus `:56`, das wörtlich `/server-side exception/` verlangt — **der Absturz ist dort die erwartete Ausgabe** (`:50-51` schreibt das selbst hin). Die neue Zusicherung lautet: *kein* Erfolgs-Chip, sondern eine deutsche Sperrmeldung (§11.5, Zustand 7). ⚠️ Wer die alte Zeile stehen lässt, konserviert den Ausfall; wer sie ohne Begründung streicht, verliert die Zusage „Sperren wirkt sofort" — die serverseitige Hälfte liegt in `actions/session-helfer.test.ts:29` und bleibt |
| `inventur.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkt 5). Der defensive Übersprung in `:26` fällt weg (§12.3, Regel 5) |
| `loeschen.spec.ts` | **Umschreiben**, die selektorlastigste Spec des Bestands (4× `.drawer`, 2× `.modalbox`, 4× `tr.click`). Netz zuerst (§12.1 Punkt 6) |
| `suche-filter.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkte 2 und 3), und mit der Rollen-Gegenprobe aus §12.3 Regel 2. Die literale URL-Zusicherung `?q=Verband` (`:30`) bleibt — sie ist der einzige Beleg für den URL-Vertrag (§5.14.1) |
| `verfall.spec.ts` | **Umschreiben.** `/× aussondern/` (`:21`) hängt zusätzlich an einem typografischen `×` im Knopftext |
| `verwaltung-flow.spec.ts` | **Umschreiben**, sechs CSS-Kopplungen; Netz zuerst (§12.1 Punkt 4). Der eigene Kommentar `:48-50` hält fest, warum `.first()` hier bewusst vermieden wurde — Sekundenauflösung der `ts`-Spalte, dieselbe Ursache wie Falle 3 (§5.14.4) |
| `verwaltung.spec.ts` | **(a) und (c) übertragen, (b) fällt.** Die literale URL `/\/\?returnTo=%2Fverwaltung%2Fartikel$/` (`:14`) hat nach dem Port kein Ziel mehr — die Spec wird **rot, nicht gegenstandslos**. Die reine `returnTo`-Logik ist ohnehin in `lib/auth/cordon.test.ts:5-52` gegatet, inklusive Endlosschleifen-Schutz und Open-Redirect (`:52`) |

### 12.6 Fünf Randbedingungen, die jede Neufassung erbt

1. **Kein globaler `env`-Block in `iuk-suite/vitest.config.ts`.** lagerbuchs `vitest.config.ts:19`
   pinnt `TZ: "Europe/Berlin"`; die Suite-Konfiguration hat keinen `env`-Block. Einen einzuziehen
   änderte die Testsemantik der vier laufenden Module — dieselbe Klasse suiteweiten Risikos, die der
   Betreiber ausdrücklich aus dieser Spec herausgenommen hat. **Und unter Entscheidung 26 (b) braucht
   ihn niemand mehr:** die Zone steht als Modulkonstante im Code (§4.5), `_lib/zeit.test.ts`
   verstellt `TZ` sogar **absichtlich** und beweist damit die Unabhängigkeit (§4.16). → Zonenabhängige
   Zusagen tragen ihre Zone am Aufrufort: entweder als Parameter der geprüften Funktion oder als
   `Intl.DateTimeFormat(…, { timeZone })` in der Erwartung. **Nie** aus lokalen Komponenten
   konstruieren und mit lokalen Gettern zurücklesen — `src/db/backup.test.ts:6-7` macht genau das und
   läuft deshalb unter **jeder** Zone grün.
2. **Der Dev-Login braucht jetzt Gruppen.** Zwölf der 13 Alt-Specs melden sich über einen
   Demo-Login an, der hart `isAdmin: true` liefert (`src/auth.config.ts:41-55`). Der Suite-Provider
   nimmt `email` **und** `groups` (`core/auth/config.ts:55-68`), und `devLogin`
   (`iuk-suite/e2e/fixtures.ts:3-9`) füllt beide Felder. → Jeder Verwaltungs-Spec ruft
   `devLogin(page, { host: "lagerbuch.localtest.me", groups: "<Wert von SUITE_ADMIN_GROUP_LAGERBUCH>" })`.
   ⚠️ **Ohne `groups` ist der Lauf nicht „fast richtig", sondern prüft das Gegenteil:** er bezeugt den
   404 aus §11.5, Zustand 19.
3. **Absolute Per-Host-URLs statt `baseURL`.** Alle 13 Alt-Specs navigieren relativ;
   `iuk-suite/playwright.config.ts:38` setzt `baseURL` auf den **Portal**-Host, und portal trägt
   `requiresAuth: true` — jeder Aufruf landete im Login. Die vier vorhandenen Module arbeiten mit
   absoluten Per-Host-URLs plus `devLogin(page, {host})` (Vorbild `e2e/qr.spec.ts:28,35`).
   `DATA_DIR=./.data/e2e` und `AUTH_COOKIE_DOMAIN=.localtest.me` stehen bereits in der
   Suite-Konfiguration. ⚠️ **Für den „fremder Suite-Host"-Fall (§3.8.3, §12.2) braucht die
   E2E-Konfiguration einen zweiten erreichbaren Host** — etwa `feedback.localtest.me` auf demselben
   Server —, sonst sind diese Zusagen nicht durchführbar.
4. **Der Seed ist ein eigener Schritt, nicht `seedAllModules()`.** Die beiden aktiven Token-Codes
   gehören ausdrücklich **nicht** dorthin — ein Seed-Zugangscode wäre in einer Generalprobe ein
   gültiger anonymer Schreibzugang. Der Weg ist ein Schritt in der `webServer.command`-Kette
   (`pnpm exec tsx e2e/seed-lagerbuch.ts && …`), wie lagerbuch es heute schon macht. ⚠️ Es gibt einen
   **zweiten** Grund, der schwerer wiegt: `seedAllModules()` ist die einzige `core`-Stelle, die
   `getModuleDb(<key>, schema)` ruft, und eine solche Verbindung kennte `lb_falte` nicht (§5.13.2).
   `ensureHandlager` ist dagegen **Schema-Vervollständigung** und liegt in `0003_handlager.sql`
   (§4.3).
   ⚠️ Zwei Codes, nicht einer: `e2e/migrate-db.ts:84-88` schreibt aus, dass ein zweiter nötig war,
   damit der Check nicht ins Journal des Helfer-Flows bucht.
5. **Kein Lauf gegen ein Produktions-Artefakt — und das bleibt so.** lagerbuchs CI startet
   ausschließlich den Playwright-eigenen `webServer`, also `next dev` mit `NODE_ENV=development`
   (`playwright.config.ts:29-40`); die Suite ebenso (`iuk-suite/playwright.config.ts:81`, `:107`).
   ⚠️ **Genau diese Naht ist der blinde Fleck von Falle 66:** dass ein geworfener Fehler in Produktion
   als englischer Satz ankommt und in Entwicklung als deutscher Text, sieht der einzige Prüflauf, der
   es sehen könnte, strukturell im falschen Modus. Deshalb ist die Umstellung auf Rückgabewerte
   (§11.2 (d)) keine Testfrage, sondern eine Bauform — ein Test kann sie nicht erzwingen, ein
   **Quelltext-Scan „keine `e.message`-Anzeige unter `m/lagerbuch`"** kann sie festhalten. Das ist die
   ehrliche Ebene: er hält die Bauform fest, nicht ihre Wirkung.

---

## 13. Verworfene Alternativen

**Lesehinweis.** Diese Tabelle sammelt jede Verwerfung dieser Spec. Wo eine Verwerfung eine
**Empfehlung der Analyse überstimmt**, ist das ausdrücklich markiert (⇄) und in §0.2 als benannte
Abweichung geführt. Wo sie eine Verwerfung **der Analyse** wiedergibt, steht sie hier, damit eine
spätere Sitzung sie nicht erneut erwägt.

### 13.1 Architektur, Zugang, Routing

| Verworfen | Grund |
|---|---|
| **Sonderzweig für lagerbuch in `core/routing.ts`, Pfadpräfix je Modul** (E10 b) | Wäre der einzige Weg, den Riegel **vor** das Rendern zu bekommen — verstößt aber gegen „nur was ein zweites, heute belegbares Modul braucht". Der Preis ist in §3.2.1 benannt und bezahlt |
| **Zwei Hosts wie `files`** (E10 c) | Kostet eine zweite Domain und macht jeden erzeugten Link host-abhängig. `files` hat zwei **disjunkte Pfadräume** und zwei Publika; lagerbuch hat einen Pfadraum, in dem `/a/<id>` für beide Rollen dieselbe Adresse ist. Außerdem setzte (c) die Host-Sperre (d) voraus |
| **Ein „kein Prod-Host konfiguriert → durchlassen"-Zweig im Host-Riegel** | Die Sperre, die sich selbst abschaltet: solange `SUITE_HOST_LAGERBUCH` fehlt, wäre genau der Zustand offen, gegen den die Datei gebaut ist. Nachgeprüft überflüssig — `moduleForHost` trifft `<key>.localtest.me` unabhängig von `prodHostsFor` (§2.6) |
| **`validateLagerbuchHosts` nach dem `files`-Vorbild** | `files` bricht bei 1 und ≥3 Hosts ab, weil es zwei Rollen hat. lagerbuch hat eine, und E16 (b) hält sich einen dauerhaften zweiten Host für gedruckte Etiketten offen (§2.6) |
| **Ein Modul-Layout mit Riegel oder Shell** | Es umschlösse weder `/t` (Route Handler) noch könnte es zwischen Helfer- und Verwaltungsklasse unterscheiden (§2.8). Es trägt ausschließlich `metadata.manifest` (§2.1 f) |
| ⇄ **`isModuleAdmin` aus `core/groups` als Zugriffsprädikat** (E9 b) | Lässt den Suite-Admin unbedingt durch (`core/groups.ts:104`, Zweck ausgeschrieben in `:13-14`). Betreiber-Entscheidung 3: Lagerbuch-Admin ist ausschließlich, wer in `SUITE_ADMIN_GROUP_LAGERBUCH` steht. `session.user.isAdmin` ist es in **keinem** Fall (Falle 13). Ebenso verboten: `canAdminModule`, `requireModuleAdmin`, `moduleAdminPageOrNotFound` (§3.6.3) |
| ⇄ **Die `files`-Verknüpfung `adminGroupsFor ∪ requiredGroupsFor`** | Bei `requiredGroups: []` wäre ein aus `feedback` abgeschautes `SUITE_ACCESS_GROUP_LAGERBUCH` eine stille zweite Tür in Journal und Etikettenbogen. Stattdessen bricht der Boot bei gesetzter Variable ab (§2.5) |
| **`/verwaltung/kein-zugriff` mitportieren** (E10a b) | Rückkehr zur 403-förmigen Auskunft, die `core/auth/guards.ts:15-17` ausdrücklich abgeschafft hat. Dazu: die Optik lebt von `globals.css:116-120` und wäre ein Neubau, und der Weg dorthin (`pages.error`) existiert nach dem Port nicht mehr (§11.4) |
| **Eine suiteweite 403-Seite** (E10a c) | Kehrt eine niedergeschriebene `core`-Entscheidung um und fasst `core` an — die Regel verlangt einen **zweiten, heute belegbaren** Nutznießer. Dazu stehen `forbidden()`/`unauthorized()` nicht zur Verfügung: `iuk-suite/next.config.ts` setzt `authInterrupts` nicht. Es wäre Flag **plus** Seite **plus** Umbau beider Guards |
| **Modul-eigene Sperrliste für sofortigen Admin-Entzug** | Eine zweite Rechtequelle, die niemand pflegt. Der Verzug von bis zu einer Stunde ist gegenüber heute (bis zu 30 Tage) eine Verbesserung (§3.6.4) |
| **Ein modul-eigener `session.error`-Riegel** | Die dritte Stelle mit einer eigenen Meinung über Sitzungsgültigkeit; der Zustand ist selten und selbstheilend (§3.6.5) |

### 13.2 Sitzung, Geheimnisse, Rate-Limit

| Verworfen | Grund |
|---|---|
| ⇄ **`AUTH_SECRET` aus der alten `stack.env` übernehmen** | Ein Geheimnis für alle fünf Module: es zu tauschen wirft jede laufende Sitzung in portal, qr, feedback und files raus. Der Gegenwert wäre nicht einmal erreichbar, weil die Verwaltung nach dem Port über den Suite-Client und unter anderem Cookie-Namen anmeldet, und weil lagerbuchs Alt-JWT kein `token.groups` trägt (§10.6) |
| **`AUTH_SECRET` mit Domänenpräfix statt eines eigenen Helfer-Geheimnisses** (E11 b) | Das heutige jose-JWT trägt **keinen** Domänentrenner; er müsste neu dazu, und alle laufenden `helfer_session`-Cookies endeten schlagartig — bei laufenden Fahrzeug-Checks am Cutover-Abend genau der Fall, den Betreiber-Entscheidung 4 vermeiden will (§3.4.1) |
| ⇄ **`LAGERBUCH_HELFER_SITZUNG_SECRET` als `${VAR:?…}` unter `environment`** | Hält den **ganzen** Stack an, sobald das Image mit lagerbuch ankommt und die `.env`-Zeile fehlt — vier unbeteiligte Module im Fenster zwischen Merge und Cutover. Ersetzt durch `env_file` plus bedingte Boot-Prüfung (§10.6) |
| **Unbedingte Zahlenpflicht beim Boot** | Dieselbe Sperrwirkung. Der Schalter ist `SUITE_HOST_LAGERBUCH` über `prodHostsFor` — dieselbe Variable, die das Modul einschaltet, schaltet seine Zahlenpflicht ein (§10.5) |
| **Den `config`-Singleton mitportieren** (`config.ts:89`) | `next build` läuft mit `NODE_ENV=production` und ohne Secrets; ein Singleton, der beim Import Pflichtvariablen fordert, bricht den Build. Der Kommentar `config.ts:91-99` erklärt es für lagerbuch selbst — und wer nur die Zeile kopiert, kopiert die Begründung nicht mit (§10.8) |
| ⇄ **Cookie-Namen auf `lb_helfer` präfixen** | Macht jede laufende Helfer-Sitzung ungültig und hebt damit den Zweck der Geheimnis-Übernahme auf. Ohne `domain` kauft der Präfix nichts (§3.4.2) |
| **Sitzungs-JWT um `jti`/`iss`/`aud` erweitern, Einzel-Widerruf je Sitzung** | Ein Code wird von mehreren Menschen gleichzeitig benutzt; „diese eine Sitzung" ist fachlich keine Einheit. Der Widerruf, den es braucht, ist `tokens.aktiv`, und der wirkt jetzt sofort und auch lesend (§3.4.3, §3.4.4) |
| **Gleitende Erneuerung der Helfer-Sitzung** | Macht aus einem verlorenen laminierten Kärtchen einen dauerhaften Schlüssel. Der Preis (Ablauf mitten im Check) ist billiger und wird zweifach bezahlt: Restzeit-Anzeige und Inline-Erneuerung **mit** erneuter Code-Eingabe (§3.4.3, §7.4.4) |
| ⇄ **Den ersten `x-forwarded-for`-Eintrag nehmen** (`core/ratelimit.ts:60`) | Der erste Eintrag ist der vom Client behauptete (CWE-348). Gegen einen Coderaum von 10⁶ am Helfer-Gate ist das der Unterschied zwischen aussichtslos und einem Nachmittag |
| ⇄ **Den rechtesten `x-forwarded-for`-Eintrag nehmen** (lagerbuchs eigene Fassung) | Unter Direktzugriff — der belegten Topologie — ebenso frei setzbar wie der erste; durch die Kette dagegen für alle Clients derselbe Wert, also ein globaler Eimer. **Beide Bestandslösungen sind für diese Topologie falsch** (§3.5.1) |
| ⇄ **`core/ratelimit.ts` in dieser Spec umbauen** | Verhaltensänderung für `feedback` und `files`, deren Schlüsselwahl aus einem Produktionsausfall stammt, und `core/ratelimit.test.ts:46-49` friert die heutige Regel **ausdrücklich** ein. Der Hebungs-Auslöser ist stattdessen benannt (§3.5.4) |
| **`SUITE_TRUSTED_PROXIES` / konfigurierbarer Hop-Zähler** | Die richtige Hop-Zahl lässt sich aus dem Repo nicht ermitteln; ein geratener Mechanismus ist schlechter als eine benannte Grenze (§3.5.4, §10.4) |
| **Globale Sperre nach N Fehlversuchen (statt eines Eimers)** | Wäre ein Denial-of-Service-Hebel: ein Angreifer sperrt mit zwanzig Fehlversuchen den Gate-Zugang für alle. Genau deshalb zählen die modulweiten Eimer **nur Fehlversuche** und liegen **hinter** der Codeprüfung (§3.5.3) |
| **Den Absender-Eimer vor der Codeprüfung belassen** | Er schützt den DB-Lookup nicht — wer den Schlüssel rotiert, startet jeden Versuch mit leerem Eimer. Was den Lookup deckelt, sind die modulweiten Zähler über die lesbare Sperrzeit, und die greifen **vor** jedem DB-Zugriff (§3.5.3, §7.5.2). Der Verbrauch vor der Prüfung kostet dagegen den `feedback`-Fall: eine Bereitschaft hinter einem Uplink verbraucht ihr Budget mit **erfolgreichen** Scans |
| **Route Handler, der beim Cutover die ALT-Cookies löscht** | Löste ein Problem, das es nur in einem der beiden Cutover-Zweige gibt, und dort löst es eine Zeile im Runbook (§3.11). ⚠️ **Nicht zu verwechseln mit `/abmelden`** (§3.4.4): der ist kein Cutover-Werkzeug, sondern der laufende Betriebsweg für ein totes Cookie — und er existiert, weil eine Server Component keins löschen kann, nicht weil ein Cutover-Zweig es nötig machte |

### 13.3 Datenmodell und Migration

| Verworfen | Grund |
|---|---|
| **Materialisierte Bestandsspalte** (E7 c) | Zweiter Wahrheitsspeicher; widerspricht der tragenden Leitplanke (`implementierungsplan.md:87/:198`). Der Engpass ist der JS-Filter, nicht die Summenbildung; SQL-Aggregation löst ihn ohne dieses Risiko (§5.2.4) |
| **Migrationsverzeichnis wörtlich kopieren** (E4 i, Variante 2) | Bricht mit dem Hausstil aller vier portierten Module und lässt keinen Platz für die Handlager-Migration; die Beweispflicht ist mit dem Schema-Diff aus §4.3 billiger als der Bruch |
| **`lagerbuch.db` als Datei kopieren** (E4 ii, Variante 1) | Die kopierte Datei trüge lagerbuchs `__drizzle_migrations` mit sieben Einträgen gegen neu gestempelte Migrationen: **Startabbruch der ganzen Suite**. Kein Datenverlust, aber ein Ausfall aller fünf Module (§4.3) |
| **`CHECK`-Constraint auf die Monatsfelder** (E6 b) | Ein Import, der an Daten scheitert, die nicht im Repo stehen; SQLite kann ihn nicht nachträglich hinzufügen, es bräuchte den Neubau einer FK-referenzierten Tabelle während des Cutovers. Und er schützt das Falsche: empfindlich ist `verfallStatus`, nicht die FEFO-Sortierung (§4.6) |
| **`UNIQUE (artikel_id, chargen_nr, verfall)`** | Zwei Lieferungen mit derselben aufgedruckten Chargennummer sind ein realer Vorgang; die Prod-Daten stehen nicht im Repo; und das Problem, das er lösen sollte, ist über den FEFO-Tiebreaker gelöst — ohne Migration und ohne Annahme (§4.8, §5.3.1) |
| ⇄ **Zuordnungstabelle `alt_sub → neu_sub`** (17. Tabelle) und eine Pflegeseite `/verwaltung/identitaeten` | Nachgeprüft unnötig: die Kennung wird nirgends gefiltert oder gruppiert (`queries.ts:91-103`, `:352-355`), nur angezeigt; beide Kennungsräume dürfen als Primärschlüssel derselben Tabelle koexistieren, und bei Gleichheit fällt der Weg **per Identität** zur Nulloperation zusammen (§4.13) |
| ⇄ **`users` beim Import leeren** (E27 a, die Empfehlung) | Die gefilterte Übernahme ist genauso ratewerkfrei (Mengenzugehörigkeit statt E-Mail-Abgleich) und macht das historische Journal nicht namenlos — was bei ungleichen `sub`-Werten **nie** heilen würde. Fällt auf (a) zurück, wenn das Prädikat nichts liefert (§4.13) |
| **Zusammenführen über `email`/`name`** (E27 b) | Die Zuordnung UUID → Person existiert in den Daten nicht; es wäre Ratewerk in einem Nachweis |
| **Trigger auch auf `o2_messungen`** (E5 b) | Zementiert genau die Zeilen aus Falle 8: ein durchgeklickter Sauerstoff-Schritt schreibt je Flasche den Nennfülldruck als Messwert. Sie sehen plausibel aus, zählen in `flaschenAuffaellig` und fallen in keinen „nicht bewertbar"-Zweig — Unwiderruflichkeit ist dort das Gegenteil dessen, was man braucht (§4.4, §5.12) |
| **Trigger auf `checks` oder `lagerort_verfall`** | `completed_at` ist nullbar — das Schema sieht den offenen, später abzuschließenden Check ausdrücklich vor; `lagerort_verfall` ist per Entwurf Upsert/Delete (§4.4) |
| **`tokens.scope_lagerort_id` streichen** | „Kein Produktionspfad schreibt sie" ist eine **Code**-Aussage; die produktive Tabelle steht nicht im Repo. Eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich, und der Import hat keinen zweiten Versuch. Sie bleibt, der Löschzähler wechselt auf `ziel_id` (§4.12, §5.21) |
| **`tokens.scope_lagerort_id` zum Riegel machen** (E14) | Wäre eine echte Verhaltensänderung — Codes, die heute im ganzen Bestand arbeiten, könnten danach nur noch ihr Fahrzeug bedienen. Das muss der Betreiber wollen und zur physischen Verteilung der Etiketten passen (§3.10, §15) |
| **Hard-Delete ganz streichen** (E8 b) | Nimmt eine heute vorhandene Fähigkeit weg — die Verwaltung würde irrtümlich angelegte Artikel nie mehr los, und die Liste wüchse monoton. Die Fehlerklasse verschwindet mit den korrigierten Zählern ohnehin (§5.21) |
| **Prozess-`TZ` als Zonenquelle** (E26 a) | Das Setzen ist ein suiteweiter Eingriff gegen vier laufende Module und **ausdrücklich nicht Teil dieser Spec**. Ein Modul, das darauf baut, hängt an einem Schritt, den diese Spec nicht schuldet (§4.5) |
| **`timestamp_ms` statt `timestamp`** | 16 Spalten würden um Faktor 1000 verschoben, und **der Paritätscheck bliebe grün**, weil beide Arme dieselbe Umrechnung fahren (§4.5) |
| **`ensureHandlager` als Boot-Schritt oder Boot-Assert** (E25 b/c) | Als Boot-Schritt liefe die Zeile außerhalb der Versionierung; als Boot-Assert machte eine fehlende Zeile aus einem Datenproblem einen Totalausfall der **ganzen** Suite (§4.3) |

### 13.4 Fachlogik, Oberfläche, Ausgabe

| Verworfen | Grund |
|---|---|
| **`gezaehlt: boolean` je Check-Position** (E1 c) | Die einzige Variante, die den fehlenden Nachweis nachrüstet — kostet aber ein Zod-Feld, eine dritte Ergebnis-Formatversion mit drittem Leser-Zweig und das Umschreiben zweier verankernder Tests. Backlog, ausdrücklich benannt (§5.8.1, §15) |
| **`zustand`-Enum mit Backfill der historischen JSONs** (E2 c) | Schreibt in einen Nachweis, um eine Typannehmlichkeit zu gewinnen — und hätte nichts zu tun, weil die drei Werte seit jeher dieselben sind (§5.8.2) |
| **`BESTELL_FAKTOR` beibehalten, mit oder ohne Default 1** (E3 b/c) | Die Variable ist nachgewiesen tot; sie mitzuschleppen konserviert die Illusion eines Reglers. Die Faktor-Formel aus `implementierungsplan.md:75/:202` zu bauen änderte **jede** Bestellmenge (§4.8, §10.2) |
| **Inventur- und Check-Absendekonvention vereinheitlichen** | Sie sind aus gutem Grund gegenläufig; Vereinheitlichen baut je nach Richtung einen Lost-Update-Kanal oder einen Check, der nichts bucht (§5.9) |
| **Beide Suchhälften auf SQL `LIKE`** | Wäre eine **Verschlechterung**: die Artikelnamen-Suche ist heute unicode-fähig und würde auf ASCII-Faltung zurückfallen (§5.13.2) |
| **Beide Suchhälften in JS** | Bräuchte alle Kommentare im Prozess — genau der O(N_Buchungen)-Ladevorgang, den Entscheidung 7 gerade beseitigt |
| **Vier ODER-verknüpfte `LIKE`-Varianten** | Eine Heuristik: sie deckt `PÄCKCHEN` gegen `Päckchen` ab und `PäCKCHEN` nicht. **Eine Suche, die in drei von vier Fällen faltet, ist schlimmer als eine, die nie faltet** |
| **Normalisierte Vergleichsspalte auf `buchungen`** | Backfill = `UPDATE buchungen` = Abbruch am Append-only-Trigger. Eine generierte Spalte scheidet aus, weil SQLite dort keine benutzerdefinierten Funktionen zulässt und `lower()` ebenfalls nur ASCII faltet |
| **`ß`/`ss` mitfalten** | Erzeugt Treffer, die niemand gesucht hat („Massen"/„Maßen"). Die Lücke ist in **beiden** Hälften gleich und damit nicht überraschend |
| **URL-Parameter umbenennen** (z. B. `q` → `suche`) | Kosten des Behaltens null, Kosten des Umbenennens gebrochene Lesezeichen (§5.14.1). ⚠️ Die eine Ausnahme ist `?err=` → `?grund=`, weil dort der Wertesatz wächst und heute ohnehin niemand liest (§3.9) |
| **`router.push` statt `replace` in der Filterleiste** | Zusammen mit dem 300-ms-Debounce ein Verlaufseintrag pro Tipppause (§5.14.1) |
| **Deckel anheben statt sichtbar machen** (E35 b/c/d) | Ein höherer Deckel verschiebt dieselbe stille Grenze nach hinten. **antd-`Table`-Pagination über die gedeckelten 100 ist ausdrücklich ausgeschlossen** — der Pager sagt „10 von 100", während dahinter fünftausend Zeilen liegen; es ist die Variante, die ein naives `<Table dataSource={journal} />` von selbst erzeugt. Echte `OFFSET`-Seiten erben Falle 3 (Sekundenauflösung ohne Tiebreaker); Cursor-Nachladen ist richtig, aber verfrüht (§5.14.3, §5.14.4) |
| **`full`- oder `kiosk`-Shell für `/helfer/*`, neue `core`-Variante `mobil`** (E28 a/b/c) | 96px Überlauf gegen `100dvh`; `kiosk` ist auf Wandmonitore getrimmt; eine vierte `core`-Variante hat keinen zweiten Nutznießer (§7.1, §7.11) |
| **Verfallsfeld bei 13px belassen oder auf antd-`DatePicker` umstellen** | Die 16px-Untergrenze und der gesperrte Zoom sind **eine** Regel; und ein 280px-Panel mit Zellrastern ist mit Handschuhen nicht bedienbar (§7.7.2) |
| **Stepper auf `InputNumber` in einem `Form.Item`** | Baut die dritte Zustandsquelle auf, die `Stepper.tsx:24-28` bewusst aufgelöst hat — in einem Feld, dessen falscher Wert eine falsche Bestandsbuchung ist (Falle 45, §7.7.3) |
| **Service Worker nach dem qr-Muster, Offline-Warteschlange** (E24 b/c) | Die Denylist ist genau der Mechanismus, der bei `qr` versagt hat; der Helfer-Weg ist ein **Schreibweg**, und eine echte Warteschlange bräuchte Konfliktauflösung gegen FEFO (§7.10.1) |
| **`m/lagerbuch/not-found.tsx`** (E36 b) | Ruht auf einer Vorbedingung, die im Repo an keinem Bestandsmodul ablesbar ist, und hat keinen Kunden: die verbleibenden `notFound()`-Würfe sind Riegel, und dafür ist die Suite-404 die gehärtete Form (§11.2) |
| **Alles so lassen — die 22 Aufrufstellen ungefangen** (E36, Nullvariante) | Der Absturz wandert mit, und in der Suite hat er zusätzlich keine Auffangfläche. `e2e/helfer-flow.spec.ts:56` zementiert ihn heute als erwartete Ausgabe (§11.2, §12.5) |
| **`e.message` weiterhin anzeigen** (die heutigen 12 gefangenen Stellen) | Der Produktions-Deserialisierer kennt für eine Fehlerzeile genau einen Zweig und baut einen `Error` mit festem englischem Text (Falle 66) |
| **Die Suite-404 als Antwort auf einen gescannten Barcode oder ein totes Regaletikett** | Ohne Shell, ohne den gescannten Code — und mit einem Absatz, der von „dieser Suite" spricht, auf einem Host, der bis eben nur die Wortmarke des Moduls zeigte (§11.3) |
| **Eine `loading.tsx` einführen** | Weder lagerbuch noch die Suite hat eine, und jede Einstiegsseite ist `force-dynamic`; eine Ladegrenze kürzte nichts ab, sondern erzeugte eine zweite Anmutung (§11.2) |
| **`body * { visibility: hidden }` im Druckpfad** (E20) | Per CSS-Modul nicht kapselbar und leert **jede** Druckseite der Suite. Gilt in **keiner** Variante von Entscheidung 20 (§8.4) |
| **Das `files`-Druckmuster (`position: fixed; overflow: hidden`)** (E20 b) | Funktioniert für **eine** Karte; der Etikettenbogen ist mehrseitig, und die Regel schnitte alles ab Seite zwei ab — still, auf gekauftem Material (§8.4) |
| **Eine zweite QR-Konfiguration neben `core/qr`** | Genau das, was `core/qr/index.ts:19-23` abgeschafft hat. Der benannte Rückfall ist ein optionaler `margin`-Parameter **in** `core/qr`, mit dem Messergebnis begründet (§8.4) |
| **Die Zeilenumfänge von CSV und Zwischenablage vereinheitlichen** | Eine Fachentscheidung im Gewand einer Aufräumarbeit. Geändert werden nur die Knopfbeschriftungen (§9.1) |
| **UTF-8-BOM oder CRLF in der CSV nachrüsten** | Beide sind heutiges Verhalten und damit 1:1-Pflicht; ein nachgerüstetes BOM kann einen Abnehmer stromabwärts brechen und verfehlte die Kopfzeilenerkennung des eigenen Importers (§9.2) |
| **Die Formel-Neutralisierung in `csvZelle` statt `csvTextZelle`** | `-` ist zugleich das Vorzeichen jeder negativen Zahl; eine Regel im Dialekt-Helfer machte aus `-3` die Zeichenkette `"'-3"`, die als TEXT ankommt und die Spalte unsummierbar macht (§9.2) |
| **Serverseitige Erzeugung des Excel-Exports** | Wäre ein **anderes Produkt**: sie kennte den Filterzustand nicht (§9.4) |
| **Antds interne Klassen als Testselektoren** | Tauscht eine Kopplung gegen eine schlechtere; antds Klassennamen sind kein Vertrag. Die Suite geht sie an **genau einer** Stelle bewusst ein (§12.3) |
| **Ein zweites DOM-Harness — oder die Hebung nach `src/core/` in dieser Spec** | `CLAUDE.md:106-107` verbietet ein zweites namentlich. Die Hebung berührt über dreißig Importzeilen in drei fremden Modulen, bringt lagerbuch keinen Nutzen und gehört als eigener Suite-Posten protokolliert (§12.2, §15) |
| **Ein globaler `env: { TZ }`-Block in `iuk-suite/vitest.config.ts`** | Änderte die Testsemantik der vier laufenden Module — und wird unter Entscheidung 26 (b) gar nicht mehr gebraucht (§12.6) |
| **`.first()`-Zusicherungen und defensive `if (count())`-Übersprünge im E2E** | Ein Worker, eine SQLite-Datei: `.first()` hängt an der angesammelten Reihenfolge aller vorher gelaufenen Specs. Und ein Test, der ohne Fixture grün ohne Zusicherung durchläuft, ist die schlechtere der beiden Fehlerformen (§12.3) |
| **Millimeter-Maße des Etikettenbogens in `_lib/grenzen.ts`** | Erzeugte eine zweite Wahrheit neben der Druck-Media-Query, die niemand gegen das Papier prüft (§10.3) |
| **Die vier Warnfenster aus `geraet.ts`/`bz.ts` konfigurierbar machen** | Sie waren nie Env. Bei `BZ_KONTROLL_INTERVALL_TAGE = 31` wäre ein Regler zusätzlich eine Einladung, eine Fälligkeit wegzukonfigurieren statt sie zu erfüllen (§10.3) |
| **Den Backup-Job „vorsichtshalber" mitnehmen** (E22 b, ohne Entscheidung) | Erzeugte zwei Regime in `/data/backups` — 14 Tage Einzeldateien neben der Tarball-Körnung von `scripts/backup.sh`. Die Entscheidung gehört dem Betreiber (§15.1 Nr. 4), nicht einem Kapitel dieser Spec; ohne sie gilt die Annahme (a) aus §10.7 |
---

## 14. Annahmen und Runbook-Eingaben

Diese beiden Listen sind vollständig und dedupliziert. Was hier nicht steht, ist keine Annahme dieser
Spec.

### 14.1 Benannte Annahmen

Jede trägt die Stelle, die sie braucht, und — wo sie falsch sein kann — die Folge.

| # | Annahme | Gebraucht in | Folge, wenn sie nicht trägt |
|---|---|---|---|
| A1 | **`TZ=Europe/Berlin`** gilt als Rechengrundlage (Betreiber-Entscheidung 2). ⚠️ Das Modul **hängt nicht daran**: die Zone steht als Konstante in `_lib/zeit.ts` | §4.5, §5.16, §7.9.3 | Für lagerbuch: keine. Für die übrige Suite: jede bisher gezogene Datumsgrenze verschöbe sich; das ist der Grund, warum das Setzen **nicht** Teil dieser Spec ist (§1.5) |
| A2 | Der **produktiv wirksame `TZ`-Wert der Alt-Instanz** ist `Europe/Berlin`. `lagerbuch/compose.yaml:7` setzt `TZ=${TZ:-Europe/Berlin}` — das ist ein **Default, keine Messung** | §4.5 | Anzeigezeiten (nie Daten) verschieben sich um die Differenz; gehört ins Cutover-Protokoll |
| A3 | ~~**Alt- und Neu-`sub` stimmen NICHT überein** (Betreiber-Entscheidung 7, konservativ)~~ — **keine Annahme mehr: gemessen.** Die Discovery der Pocket-ID-Instanz liefert `subject_types_supported: ["public"]`, pairwise identifiers werden nicht angeboten, der `sub` ist über beide OIDC-Clients gleich. Der Hinweis aus dem eigenen Repo ist damit bestätigt (`core/directory/index.ts:36-39` → `claims["sub"] = user.ID`) | §4.13, §3.7.3 | Der Weg fällt **per Identität** zur Nulloperation zusammen, wie vorgesehen. ⚠️ **Die Zeile bleibt als Serverangabe stehen** (der Messwert steht nicht im Repo) — und sie ersetzt **nicht** R11: die Discovery sagt etwas über die Ausstellung heute, nicht über die vorhandenen Zeilen |
| A3b | **Der Bruch INNERHALB von lagerbuch trifft fast den gesamten `users`-Altbestand.** `f2b515b` liegt am 29.07.2026, der Freeze auf `ca04eb1` fünf Tage später — wie viele Personen sich in diesem Fenster angemeldet haben, steht nicht im Repo | §4.13 (Befund 1), §1.4 | Bestimmt den Umfang der **Bereinigung über die Klarnamen** (Spec 2, §1.3). Trägt die Annahme nicht (fast alle haben sich noch angemeldet), schrumpft die Arbeit auf null; sie fällt nicht größer aus, als die Waisenzeilen es hergeben. Runbook-Eingabe: die zwei Zeilenzahlen (§3.11) |
| A4 | Der produktive Gruppenname ist **`lagerbuch-admin`** (Vorgabe von `OIDC_ADMIN_GROUP`, `src/lib/config.ts:46`) | §2.3, §3.6.1 | Abweichend über `SUITE_ADMIN_GROUP_LAGERBUCH` setzbar, ohne Rebuild. Ein falscher Wert sperrt **alle** Verwaltenden aus (§3.6.2) |
| A5 | **Vor dem Cutover ist das Modul in Produktion nicht erreichbar**, weil `SUITE_TRAEFIK_RULE` die Domain nicht führt. Betreiberangabe, keine Repo-Tatsache | §2.6 (Zeile „0 Hosts = erlaubt") | Wäre es doch erreichbar, wäre `/m/lagerbuch/*` von jedem terminierenden Host offen — der Host-Riegel greift dann trotzdem, nur die Aussage „vor dem Cutover kein Traffic" wäre falsch |
| A6 | Der **Alt-Host** (`APP_BASE_URL` der produktiven `stack.env`) ist zeichengleich `SUITE_HOST_LAGERBUCH` | §7.4.1, §8.1, §3.11 | **Zwei Folgen zugleich:** die Helfer-Sitzungen überleben den Cutover nicht (host-only Cookie), und jeder gedruckte QR aus Form 1 und 2 ist auf den alten Wert gebrannt (dann E16 b: Alt-Host als zweiter Eintrag) |
| A7 | **`ContainerOutlined`** ist ein passendes Modul-Icon. Die Existenz ist gemessen (`node_modules/@ant-design/icons/es/icons/ContainerOutlined.js`, 03.08.2026), die Eignung ist eine Gestaltungsannahme | §2.2, §2.3 | Ohne Folge tauschbar, solange der Name in der `ICONS`-Map steht |
| A8 | Die **23 Seiten** unter `verwaltung/(arbeit)/` entsprechen dem heutigen Bestand ohne `kein-zugriff`. Übertragung, keine Neuerfindung | §2.1, §6.2.2 | — |
| A9 | `lagerbuch` wird ans **Ende** von `MODULE_MIGRATIONS` und `MODULES` einsortiert; die Reihenfolge hat keine fachliche Bedeutung außer der Migrations-Abarbeitungsreihenfolge | §2.4 | — |
| A10 | Der prozess-lokale `Set` in `meldeFehlendeGruppe` wächst mit der Zahl abgewiesener **Personen**, nicht Anfragen; bei dieser Organisationsgröße eine dreistellige Obergrenze | §3.3 | Bräuchte sonst eine Verdrängung |
| A11 | Die Zahl gleichzeitig **aktiver Zugangs-Codes** liegt im Bereich 10–60. Darauf ist `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE = 300` kalibriert (Sweep-Erwartung 4,5 bis 13 Tage) | §3.5.3, §10.3 | Liegt sie deutlich höher, muss die Zahl gesenkt werden — sie ist deshalb eine Env-Variable an genau einer Stelle |
| A12 | Ein **relativer `Location`-Kopf** (RFC 7231 §7.1.2) wird gegen die angefragte URL aufgelöst, also gegen denselben Host, auf den das Cookie gesetzt wird | §3.4.6, §7.2.3, §8.2 | Der benannte Rückfall ist die Host-Rekonstruktion über `x-forwarded-host` — **nie** aus der Konfiguration. Der E2E aus §7.12.4 prüft es |
| A13 | Das Rendern von **Layout und Seite ist in Next.js nicht garantiert sequenziell**. Deshalb die Zwei-Linien-Regel: Layout-Riegel als erste Linie, jede Seite mit URL-abgeleiteter Kennung prüft zusätzlich selbst | §3.2.1 | Ohne die Annahme wäre die zweite Linie überflüssig — sie kostet wenig und ist die `feedback`-Praxis |
| A14 | Die produktive `lagerbuch.db` enthält **keine `verfall`-Werte außerhalb 01–12**. Nicht belegbar aus dem Repo | §4.6 | Deshalb kein CHECK-Constraint, sondern eine Scan-Abfrage als Runbook-Gate mit ausgeschriebener Behandlung von Treffern. ⚠️ Für `bz_kontrollen` gibt es nach dem Cutover **keinen zweiten Versuch** (S2-Trigger) |
| A15 | Die produktive `lagerbuch.db` enthält **keine doppelten `(artikel_id, chargen_nr, verfall)`-Tripel**. Nicht belegbar | §4.8 | Deshalb kein UNIQUE-Index, nur eine Diagnose-Abfrage. Der FEFO-Determinismus hängt nicht daran (§5.3.1) |
| A16 | **`tokens.scope_lagerort_id` ist produktiv durchweg `NULL`** (kein Produktionspfad schreibt sie). Nur eine **Code**-Aussage | §4.12 | Deshalb bleibt die Spalte erhalten statt gestrichen zu werden — eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich. Diagnose-Abfrage im Runbook |
| A17 | Der **Barcode-Namensraum** ist produktiv über `geraete` und `bz_geraete` kollisionsfrei. Die tabellenübergreifende Eindeutigkeit lebt nur in `pruefeBarcodeFrei`, nicht im Schema | §4.8 | INTERSECT-Abfrage als Runbook-Gate; eine Doppelvergabe verschattet still den zweiten Treffer |
| A18 | Es wird **nicht** vorausgesetzt, dass jede Person mit historischen Journalzeilen sich nach dem Cutover an der Suite anmeldet — die alten Namen stehen in der importierten `users`-Zeile | §4.13 | — |
| A19 | Die **Suite-Sitzung führt `name`- und `email`-Claims**. Trifft das nicht zu, entsteht der benannte Defektzustand (`users`-Zeile mit beiden Feldern `NULL` → rohe Kennung im Journal) | §4.13 (i) | Der passende OIDC-Scope wäre dann eine Schuld des Auth-Kapitels; `merkeNutzer` protokolliert den Fall sichtbar |
| A20 | **Bandbreiten-Rechnung** §5.2.3: 400 aktive Artikel, 8 Fahrzeuge, 60 Soll-Positionen je Fahrzeug, `better-sqlite3` ~1 μs/Zeile, V8 ~10 ns/Vergleich. Alle Zeitwerte sind **gerechnet, nicht gemessen** | §5.2.3 | Die echte Zeilenzahl ist Runbook-Eingabe; die Grenze („~100 000 Zeilen blockieren die **gesamte** Suite, weil `better-sqlite3` synchron ist") verschiebt sich mit ihr |
| A21 | **Wachstumsschätzung:** 60–240 Buchungszeilen je Fahrzeug-Check, 8 Fahrzeuge, monatlich → 6 000–23 000 Zeilen/Jahr, daraus „4–15 Betriebsjahre bis zur Grenze". Die tatsächliche Check-Frequenz ist unbelegt | §5.2.3 | Entscheidet, ob die SQL-Aggregation aus §5.2.4 vor oder nach dem Cutover greifen muss |
| A22 | **Nichts außerhalb von `_db/client.ts` braucht ein lagerbuch-DB-Handle.** Belegt für den Bootstrap (`migrateAllModules` öffnet eine eigene, schema-freie Verbindung; `core/health` ebenso und fährt nur `SELECT 1`; `seedAllModules` ist der einzige `getModuleDb`-Konsument und bekommt keinen lagerbuch-Eintrag) | §5.13.2 | Dreifach abgesichert: geteilter Cache-Schlüssel, Auslassung im Bootstrap, Quelltext-Zusicherung. Trägt die Rahmung nicht, ist der benannte Rückfall Entscheidung (a) — die Such-Ungleichheit 1:1 übernehmen und ausschreiben |
| A23 | In `checks.ergebnis` stehen nur die **drei bekannten Zustands-Literale**. Nicht belegt | §5.8.2 | Deshalb bleiben die Leser tolerant statt zu werfen: unbekannter Zustand wird angezeigt wie gespeichert und zählt **nicht** als auffällig |
| A24 | Die **URL-Parameternamen** `q`/`typ`/`von`/`bis` und `fz` sind verbindlich und werden wörtlich übernommen (Betreiberfrage 35 unbeantwortet; im Repo nur einmal gebunden über `e2e/suche-filter.spec.ts:30`) | §5.14.1 | Kosten des Behaltens null, Kosten des Umbenennens gebrochene Lesezeichen |
| A25 | **Hersteller-EANs stehen tatsächlich im Bestand.** Nicht belegt (offene Betreiberfrage) | §7.6.2 | Die Entscheidung ist gegen beide Antworten robust: die sieben Formate zu behalten kostet nichts, sie zu entfernen ist gegen gedruckte Hardware unumkehrbar |
| A26 | **Im Lagerraum und in der Fahrzeughalle liegt Netz an** (WLAN oder Mobilfunk). Nicht belegt | §7.10.1 | Ist das falsch, ist die Antwort **nicht** ein Service Worker, sondern ein Access Point — weil der Helfer-Weg ein Schreibweg ist |
| A27 | **Installierte PWA und Standardbrowser teilen sich auf iOS die Cookie-Partition nicht.** Browserverhalten, nicht im Repo belegbar | §7.10.4 | Prüfpunkt für die Generalprobe; die Abhilfe wäre ein Satz in der Übergabe, keine Codeänderung. Die Inline-Erneuerung (§7.4.4) macht den Fall in jedem Fall erträglich |
| A28 | **`*.localtest.me` ist kein secure context** in gängigen Browsern (die Allowlist prüft die Hostzeichenkette, nicht die aufgelöste Adresse) | §9.3 | Der Rückfallweg (Modal mit markierbarem Text) greift nur, wenn `navigator.clipboard` fehlt — er ist also harmlos, falls die Annahme nicht trägt |
| A29 | Der **Abnehmer von `bestellvorschlag.csv` ist eine Tabellenkalkulation**, kein maschineller Importer (Betreiberfrage 43 unbeantwortet). Belegbar ist nur die Gegenrichtung: der einzige auffindbare maschinelle Abnehmer — der modul-eigene CSV-Import — kann die Datei weder in den Spalten noch in der Quotierung lesen | §9.2 | Die Formel-Neutralisierung wäre dann Kosten ohne Gegenwert; sie ändert aber keine reale Zelle (§9.2) |
| A30 | Die **QR-Nutzlast** liegt bei ~52 Byte (27 Zeichen Host + `/a/` + 21 nanoid-Zeichen) | §8.4 | Ein deutlich längerer Host verschiebt die QR-Version nach oben; die physische Abnahmeprüfung fängt das ab, die Rechnung nicht |
| A31 | **Entscheidung 22 (Backup-Job) fällt auf (a)**, solange der Betreiber (§15.1 Nr. 4) nichts anderes entscheidet: `scripts/backup.sh` der Suite erfasst `lagerbuch.db` über den vorhandenen Glob, der Modul-Job wandert nicht mit | §10.7, §2.2 | Der Preis ist Tarball-Körnung statt Einzeldateien und `KEEP` statt Tagen. `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` entfällt dann ersatzlos |

### 14.2 Runbook-Eingaben

**Was nur auf dem Server steht, steht nicht im Repo.** Diese Liste ist die vollständige Menge dessen,
was der Cutover erheben, setzen oder prüfen muss.

#### Vor dem Bau (blockiert einzelne Festlegungen)

| # | Eingabe | Braucht sie |
|---|---|---|
| R1 | Produktiver Wert von **`OIDC_ADMIN_GROUP`** aus der `stack.env` (`lagerbuch/compose.yaml:23`) | §2.3, §3.6.1 — wird zu `SUITE_ADMIN_GROUP_LAGERBUCH` |
| R2 | Produktive Werte von **`WARN_TAGE_KRITISCH`**, **`WARN_TAGE_FAELLIG`**, **`HELFER_SESSION_STUNDEN`** (Vorgaben 31 / 56 / 12) | §10.1, §10.3 — sie werden auf die neuen Schlüsselnamen umgeschrieben; sind sie nicht gesetzt, greifen die Vorgaben. ⚠️ **`BESTELL_FAKTOR` wird NICHT erhoben** — es ist gestrichen |
| R3 | Produktiv gesetzter **`DATA_DIR`** der Suite (gitignorierte `env_file`) | §4.1 — entscheidet, ob der Zielpfad `/data/lagerbuch.db` byte-gleich mit dem Quellpfad ist |
| R4 | **`select count(*) from tokens where aktiv = 1`** | §3.5.3, §10.3 — kalibriert `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` |
| R5 | **Zeilenzahlen je Tabelle** und die **älteste `buchungen.ts`** (Betreiberfrage 9) | §4.14, §5.2.3 — ohne sie kein Performance-Budget und ein geratenes Wartungsfenster |
| R6 | **Produktiv wirksamer `TZ`-Wert der Alt-Instanz** | §4.5 (A2) |
| R7 | **Ist der Alt-Host (`APP_BASE_URL`) zeichengleich `lagerbuch.iuk-ue.de`?** Mit Schema, ohne abschließenden Schrägstrich | §7.4.1, §8.1 (A6) — **eine Angabe, zwei Folgen** |

#### Datenprüfungen vor dem Cutover (Generalprobe **und** Cutover-Abend)

| # | Prüfung | Behandlung von Treffern |
|---|---|---|
| R8 | **Monatswerte außerhalb 01–12** in `chargen.verfall`, `lagerort_verfall.verfall`, `bz_kontrollen.kompresse_verfall` (SQL in §4.6) | Korrektur **vor dem Freeze in der Alt-Anwendung**, nie im Importer. ⚠️ Für `bz_kontrollen` gibt es nach dem Cutover **keinen zweiten Versuch**. Bleibt ein Treffer stehen, kommt er unverändert mit und wird namentlich in der Cutover-Notiz geführt |
| R9 | **Barcode-Kreuzkollision:** `SELECT barcode FROM geraete WHERE barcode IS NOT NULL INTERSECT SELECT barcode FROM bz_geraete WHERE barcode IS NOT NULL;` | muss **leer** sein (§4.8) |
| R10 | **Löst jedes `tokens.ziel_id` auf?** (`ziel_typ='fahrzeug'` → `lagerorte`, `'artikel'` → `artikel`) | Treffer sind laminierte Kärtchen ins Leere — sie werden **gesperrt**, nicht importiert-und-vergessen (§4.14) |
| R11 | **`sub`-Stichprobe:** einen `quelle_id`-Wert mit `quelle_typ='oidc'` aus der produktiven `lagerbuch.db` ziehen und gegen den `sub` halten, den die laufende Suite für dieselbe Person führt | ✅ Die **Client**-Frage ist beantwortet (`subject_types_supported: ["public"]`, §4.13, Befund 2) — die Stichprobe bleibt, weil sie die **vorhandenen Zeilen** prüft und nicht die Ausstellung von heute. ⚠️ **Der Paritätscheck beantwortet die Frage NICHT** — er ist in beiden Fällen grün |
| R11b | **Umfang der `users`-Bereinigung:** zwei `SELECT count(*)` — wie viele `users`-Zeilen das Filterprädikat aus §4.13 (ii) **nicht** trifft (die Waisen), und für wie viele `quelle_id`-Werte aus `buchungen` es **keine** `users`-Zeile gibt | §4.13, Befund 1. Bestimmt den Umfang der **Bereinigung über die Klarnamen** (Spec 2). Steht nicht im Repo: der Bruch endete am 29.07.2026, der Freeze liegt fünf Tage später |
| R12 | Diagnose: `SELECT artikel_id, chargen_nr, verfall, count(*) c FROM chargen GROUP BY 1,2,3 HAVING c > 1;` | Ergebnis in die Cutover-Notiz, **kein** Abbruch (§4.8) |
| R13 | Diagnose: `SELECT count(*) FROM tokens WHERE scope_lagerort_id IS NOT NULL;` | Bei 0 ist der Befund zur toten Spalte geschlossen; sie kann dann in einer **späteren** Migration fallen (§4.12) |
| R14 | Diagnose: Gibt es Check-Ergebnisse mit `flaschen`-Einträgen **ohne** `nennfuelldruckBar`, und stehen darunter Flaschen mit einem Nennfülldruck ≠ 200 bar? | Bestimmt, wie viele historische Füllstände heute falsch skaliert angezeigt werden (§5.12) |
| R15 | **Zahl der beim Import verworfenen `users`-Waisenzeilen** (Differenz aus `count(*)` und dem Prädikat aus §4.13) | gehört ins Cutover-Protokoll |
| R16 | **Zahl der aktiven Tokens und aktiven Artikel** zum Cutover-Zeitpunkt | Kontrollwert für den ersten Etikettendruck nach dem Umzug |

#### Werte, die gesetzt werden

| # | Zeile | Anmerkung |
|---|---|---|
| R17 | **`SUITE_HOST_LAGERBUCH=lagerbuch.iuk-ue.de`** | ohne Protokoll, ohne Port, kleingeschrieben (`validateHostConfig` weist `:` und `/` ab). **Rollback = Zeile leeren** — das nimmt die Domain vollständig vom Netz. ⚠️ Führt sie je mehrere Hosts, ist die **Reihenfolge** bedeutungstragend und darf nach dem ersten Etikettendruck nicht mehr geändert werden (§8.1) |
| R18 | **`SUITE_TRAEFIK_RULE`** muss denselben Host führen | sonst erreicht die Domain den Container nie und der Boot bleibt trotzdem fehlerfrei |
| R19 | **`SUITE_ADMIN_GROUP_LAGERBUCH=<R1>`** | ⚠️ Leer oder falsch gesetzt sperrt **alle** aus dem Verwaltungszweig aus; es gibt für dieses Modul bewusst keine Suite-Admin-Rückfallebene (§3.6.2). Der Boot bricht bei fehlender Variable ab (§10.5) |
| R20 | **`SUITE_ACCESS_GROUP_LAGERBUCH` NICHT setzen** | ein gesetzter Wert bricht den Boot ab (§2.5, §10.5) |
| R21 | **`LAGERBUCH_HELFER_SITZUNG_SECRET`** = Wert von `HELFER_SESSION_SECRET` aus der produktiven `stack.env`, 1:1, unter **neuem** Schlüsselnamen; über **`env_file`**, nicht als `${VAR:?…}` (§10.6) | ≥ 32 Zeichen, ≠ Dev-Vorgabe, ≠ `AUTH_SECRET` — sonst Boot-Abbruch |
| R22 | **`AUTH_SECRET` der Suite bleibt unverändert.** lagerbuchs `AUTH_SECRET` wird **nicht** übernommen | §10.6. Fehlerfall: alle Nutzer von portal, qr, feedback und files auf einen Schlag abgemeldet — für einen Nutzen, den es nicht gibt. **Die Verwaltung meldet sich nach dem Cutover einmal neu an** |
| R23 | **`LAGERBUCH_VERFALL_ROT_TAGE`**, **`LAGERBUCH_VERFALL_GELB_TAGE`**, **`LAGERBUCH_HELFER_SITZUNG_STUNDEN`** aus R2 | Umbenennung ist eine Runbook-Zeile, keine Codearbeit (§10.1) |
| R24 | **`LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5`**, **`…_GESAMT_PRO_MIN=30`**, **`…_GESAMT_PRO_STUNDE=300`** | Kopplung `ABSENDER ≤ GESAMT_PRO_MIN ≤ GESAMT_PRO_STUNDE` wird beim Boot geprüft (§10.5) |
| R25 | **`TZ=Europe/Berlin`** suiteweit | ⚠️ **Eigener Schritt mit eigener Prüfung gegen portal, qr, feedback und files. Nicht Teil dieser Spec.** Für lagerbuch selbst nicht tragend (§4.5) |

#### Betriebliche Schritte und Gegenproben

| # | Schritt | Gegenprobe |
|---|---|---|
| R26 | **Den direkten Weg an Cloudflare vorbei schließen** — kein Host-Port-Mapping am Suite-Dienst, Traefik-Entrypoint nur aus den Cloudflare-Bereichen erreichbar | Anfrage aus dem lokalen Netz gegen den Entrypoint mit gesetztem `CF-Connecting-IP`; erwartet: **keine Antwort**. Solange der Weg offen ist, tragen allein die beiden modulweiten Zähler (§3.5.2) |
| R27 | **Falls die Hosts identisch sind (R7): jede verwaltende Person meldet sich VOR dem Freeze auf dem Alt-Stack ab** (Knopf in `src/app/verwaltung/(admin)/layout.tsx:25`) | ⚠️ **Nicht zu „Website-Daten löschen" ausweiten** — das zerstörte die `helfer_session`-Cookies, die erhalten bleiben sollen. Symptom bei Versäumnis: die Anmeldung greift scheinbar nicht, und ein erneuter Login behebt es **nicht** (§3.11) |
| R28 | **Externen Health-Monitor** von `<host>/api/health` auf **`/api/health/lagerbuch`** umstellen | `<host>/api/health` antwortet danach weiter `ok`, **ohne etwas über lagerbuch zu sagen** (Falle 51, §2.7) |
| R29 | Nach dem Umschwenken: `curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest` und `/icon-192.png` gegen §7.10.2 halten | `curl -si https://<portal-host>/manifest.webmanifest` darf das lagerbuch-Manifest **nicht** liefern |
| R30 | **Physische Abnahme des Etikettenbogens:** Probebogen auf dem tatsächlich benutzten Drucker und dem tatsächlich gekauften Material | je fünf Etiketten aus der ersten und der letzten Zeile mit **zwei** Telefonen aus 15 cm scannen. Scheitert die Abnahme, greift der Rückfall aus Entscheidung 8-I (§8.4) |
| R31 | **Generalprobe, ein Gerät:** PWA installieren, im Browser einlösen, Regaletikett mit der Systemkamera scannen | notieren, ob eine Sitzung da ist (A27, §7.10.4). Bei Nein: ein Satz in die Übergabe, keine Codeänderung |
| R32 | **Generalprobe, ein Kärtchen:** ein echtes, laminiertes Kärtchen aus dem Bestand scannen | der einzige Test, der Host, Code, Normalisierung, Cookie und Landeziel **zusammen** beweist — und er kostet dreißig Sekunden |
| R33 | **Einmaliger Schema-Diff** Alt-Repo gegen Zielverzeichnis (Kommandos in §4.3) | mit dem dort ausgeschriebenen, **abschließenden** Erwartungswert: zwei Trigger auf `bz_kontrollen`, vier Indizes, Formatierung. **Jede weitere Zeile ist ein Fehler** |
| R34 | **`backups/`-Verzeichnis im Volume `lagerbuch_data` wegsichern**, bevor der Alt-Stack abgebaut wird | die einzige historische Tiefe vor dem Cutover-Snapshot (§10.7) |
| R35 | **Die alte `stack.env` nach dem Abbau LÖSCHEN** | sonst bleibt ein gültiges Sitzungsgeheimnis in einer Datei liegen, die niemand mehr pflegt (§3.11) |
| R36 | Optional: **die Alt-Domain nach dem Cutover weiterleiten lassen** | sonst sterben außerhalb der Anwendung gedruckte `/g/<code>`-QR-Aufkleber (§7.6.2) |
| R37 | **In die Betriebsübergabe:** deaktivierte Artikel bleiben unter `/a/<id>` bebuchbar, sind aber nicht mehr nachdruckbar | die Menge der physisch hängenden Etiketten ist **echt größer** als die der druckbaren, und die Differenz ist im Repo nicht abzählbar (§8.4, Falle 26) |
| R38 | **In die Betriebsübergabe:** der Zählschritt des Fahrzeug-Checks läuft ohne Netz weiter; zum Abschließen muss man einmal wieder in Reichweite kommen | die einzige „Offline-Fähigkeit", die das Modul zusagt (§7.10.3) |

---

## 15. Offene Fragen

### 15.1 Blockiert einzelne Festlegungen, nicht den Baubeginn

| # | Frage | Wer antwortet | Was daran hängt |
|---|---|---|---|
| 1 | ~~Entscheidung 30 — die Hexwerte der Ampelpalette~~ | **beantwortet in §6.6.2** | Die Werte stehen dort samt Luminanzen, Kontrasten und dem Test, der sie hält (§6.6.2a). Was bleibt, ist **keine Frage, sondern eine Ankündigung**: Gelb und Rot ändern sich sichtbar, und das gehört ins Cutover-Anschreiben (§6.14) |
| 2 | ~~Entscheidung 31 — der Inhalt von `LAGERBUCH_NAV`~~ | **beantwortet in §6.3.1/§6.3.2** | Alle 15 Ziele bleiben, `.modulnav` bekommt `overflow-x: auto` — eine `core`-**Reparatur**, kein Hebungsfall, mit eigenem Commit (Anhang, Arbeit 4) und zwei Playwright-Zusicherungen |
| 3 | ~~Entscheidung 32 — die Schriftwahl der Verwaltungsansicht~~ | **beantwortet in §6.7.1** | Geist in der Verwaltung, Barlow Condensed nur noch in der öffentlichen Ansichtsklasse. ⚠️ Unter der benannten **Annahme**, dass die drei Google-Schriften keine CD-Vorgabe sind (Betreiberfrage 29) — trifft sie nicht zu, kehrt sich genau ein Spiegelstrich um, die Rollen (§6.7.2) bleiben |
| 4 | **Entscheidung 22 — Backup-Job** (`starteLagerbuchHintergrund()` oder `scripts/backup.sh`) | **Betreiber** | Ohne Entscheidung gilt A31: (a), `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` entfällt, `startBackgroundWork()` bekommt keinen Eintrag (§10.7, §2.2 Punkt 7). ⚠️ **Entscheidung 23** (`deploymentId`, Release-Kanal) stand hier daneben und war einem „Betriebskapitel" zugeschrieben, das es nicht gibt; sie ist jetzt §15.3 Nr. 24 |
| 5 | **Soll `tokens.scope_lagerort_id` je ein Riegel werden?** (Entscheidung 14) | **Betreiber** | Wäre eine echte Verhaltensänderung und muss zur physischen Verteilung der Etiketten passen. Bis dahin: kein Riegel, aber die Spalte bleibt (§3.10, §4.12). §7.9.1 benennt die zwei Orte, an denen eine spätere Durchsetzung ansetzt |
| 6 | **Liegt im Lagerraum und in der Fahrzeughalle Netz an?** (A26) | **Betreiber** | Bei Nein ist die Antwort ein Access Point, kein Service Worker (§7.10.1) |
| 7 | **In welchem Programm wird `bestellvorschlag.csv` geöffnet?** (Betreiberfrage 43, A29) | **Betreiber** | Die Formel-Neutralisierung ist unter A29 entschieden und ändert keine reale Zelle; die Antwort bestätigt oder entwertet sie (§9.2) |
| 8 | **Stehen Hersteller-EANs tatsächlich im Bestand?** (A25) | **Betreiber** | Die Entscheidung ist gegen beide Antworten robust (§7.6.2) |
| 9 | **Soll eine abgelöste Domain dauerhaft als zweiter Host mitlaufen?** (E16 b) | **Betreiber** | Die Spec erlaubt es (§2.6); die Entscheidung ist betrieblich. ⚠️ Ein zweiter Host macht die Reihenfolge in `SUITE_HOST_LAGERBUCH` bedeutungstragend (§8.1) |

### 15.2 Wird gemessen, nicht entschieden

| # | Frage | Prüfweg |
|---|---|---|
| 10 | Rendert eine Modul-`error.tsx` **innerhalb** von `m/lagerbuch/layout.tsx`? | Eine Route absichtlich werfen lassen und **echt abrufen**. Im Repo an keinem Bestandsmodul ablesbar. Fällt die Messung anders aus, ist der Fehlertext trotzdem richtig, nur die Rahmung eine andere (§11.2) |
| 11 | Löst ein relativer `Location`-Kopf hinter dem Suite-Rewrite gegen den **äußeren** Host auf? (A12) | E2E aus §7.12.4. Rückfall: Host-Rekonstruktion über `x-forwarded-host` |
| 12 | Liefert `usePathname()` unter Next **16.2.11** und hinter einem echten Reverse-Proxy weiter den äußeren Pfad? | E2E aus §7.8.2 Punkt 5. Die vorhandene Messung steht gegen 16.2.6, per `curl`, ohne Proxy (§12.4). ⚠️ Im Modul kommt `usePathname` gar nicht vor — geprüft wird die `href`-Auflösung |
| 13 | Teilen PWA und Standardbrowser auf den eingesetzten Geräten die Cookie-Partition? (A27) | R31 |
| 14 | Passt der Etikettenbogen auf das gekaufte Material, und sind die QR bei Level H lesbar? (A30) | R30 |

### 15.3 Ausdrücklich NICHT Teil dieser Spec — eigene Vorhaben

| # | Gegenstand | Warum getrennt |
|---|---|---|
| 15 | **`TZ=Europe/Berlin` setzen** | Suiteweiter Eingriff in den Betrieb von vier Modulen, mit eigener Prüfung (§1.5). Für lagerbuch selbst nicht tragend |
| 16 | **Den Suite-Admin-Kurzschluss in `core/groups.ts:104` entfernen** | Eigene `core`-Arbeit, berührt portal, qr und files. lagerbuch erreicht das Ziel modulintern und ist vorwärtskompatibel (§1.5, §3.6.2) |
| 17 | **Das suiteweite Gating von `/m/*`** | Eigene Suite-Spec; für lagerbuch genügt der modulinterne Host-Riegel (§1.5, §3.2.4) |
| 18 | **`core/ratelimit.ts#clientIpAus` umbauen** | Verhaltensänderung für vier laufende Module, deren Schlüsselwahl aus einem Produktionsausfall stammt. Der Hebungs-Auslöser ist benannt: ein zweites Modul mit anonymem Schreibpfad und erratbarem Geheimnis, oder eine suiteweite Entscheidung (§3.5.4) |
| 19 | **`maxAge` für das `authjs.callback-url`-Cookie** in `core/auth/cookies.ts` | Benannter Suite-Posten; lagerbuch hatte den Fix, die Suite hat ihn nicht, und die betroffene Population (Telefone, PWAs) ist genau die von lagerbuch (§3.6.6) |
| 20 | **Die Hebung des DOM-Harness nach `src/core/test-dom.tsx`** | Der Auslöser ist längst gefallen (drei Module plus `core` importieren aus `qr/_lib/test-dom`), die Hebung ist nicht erfolgt. Sie berührt über dreißig Importzeilen in drei fremden Modulen und gehört als eigener, protokollierter Suite-Posten gefahren — **nicht** still über eine Modul-Spec (§12.2) |
| 21 | **Eine Hebung der Zonenrechnung nach `core/zeit`** | Mit `_lib/zeit.ts` gibt es sie ab jetzt in **zwei** Modulen (`feedback` und `lagerbuch`), die `core`-Regel wäre damit erstmals erfüllt. Die Hebung wird hier **nicht** nebenbei vollzogen (§4.5) |
| 22 | **`gezaehlt: boolean` je Check-Position** (E1 c) | Die einzige Variante, die den fehlenden Nachweis nachrüstet — Backlog, damit sie eine Entscheidung bleibt und nicht als Nebenwirkung stattfindet (§5.8.1) |
| 23 | **Die `revalidatePath`-Listen der Verwaltungs-Actions** — welche Action welche Pfade revalidiert, über 61 Bestandsaufrufe | Die **Regel** ist entschieden (innere Pfadform, §2.1 g; die zwei Helfer-Actions sind in §7.9.5 ausgeschrieben), die **Zuordnung** ist enumerierbare Arbeit ohne Eigentümer in diesem Dokument. §6 baut die Oberfläche, nicht diese Liste (§0.3, Punkt 1) |
| 24 | **`deploymentId` suiteweit nachrüsten und den Release-Kanal festlegen** (Entscheidung 23) | War acht Stellen lang „dem Betriebskapitel" zugeschrieben — das es in dieser Spec nicht gibt und in Spec 2 auch nicht (§1.3). `deploymentId` berührt alle fünf Module, der Release-Kanal ist eine Compose-/Deploy-Frage (`iuk-suite/compose.yaml:102`); beides ist keine Modulentscheidung. Die Empfehlung der Analyse — (a) und (d) — wandert unverändert mit (§1.5, Punkt 4). ⚠️ **Kein Bauweg dieser Spec hängt daran**, es blockiert also nichts |
| 25 | **Die Bereinigung der auf Zufalls-UUIDs geschlüsselten `users`-Zeilen im Bestand der SUITE** — nach demselben Entwurf, den Spec 2 für lagerbuch fährt | ⚠️ **Betreiberangabe, nicht aus diesem Repo belegbar:** dieselbe Altlast steht laut Post-Cutover-Befund zu `feedback` in der Suite selbst noch unbereinigt. Der **Entwurf** gehört zu §4.13 und wird **einmal** gemacht — zwei getrennte Verfahren ordneten dieselben Personen unterschiedlich zu, und die Frage ist an beiden Stellen dieselbe: welcher Klarname gehört zu welchem `sub`. Die **Anwendung** auf den Suite-Bestand ist eigene Arbeit, weil sie fremde Module und fremde Tabellen anfasst. ⚠️ **Kein Bauweg dieser Spec hängt daran** |

---

## Anhang: Abhängigkeiten der Bauwege

Die tragende Schicht zuerst, danach drei möglichst unabhängige Gruppen.

```
A  Modulgeruest (§2)
   Registrierungs-Dreieck · Registry · _lib/host.ts · Route-Baum · Modul-Layout
        │
        ├──────────────────────────────┐
        ▼                              ▼
B  Datenmodell (§4)              C  Zugang (§3)
   schema.ts · Migrationen          _lib/zugang.ts · _lib/helferSitzung.ts
   Trigger · _db/client.ts          _lib/helferZugang.ts · _lib/absender.ts
   (mit lb_falte)                   _lib/gateSchranke.ts · _lib/code.ts
        │                              │
        └──────────────┬───────────────┘
                       ▼
D  Fachlogik (§5)  +  Grenzen (§10)
   _lib/domain/* · _lib/zeit.ts · _lib/konstanten.ts · _lib/grenzen.ts
   _lib/lesepfade/* · _lib/schreibpfade/* · _lib/boot.ts
                       │
        ┌──────────────┼──────────────────────────┐
        ▼              ▼                          ▼
E  Helfer-Weg (§7)   F  Verwaltung (§6)      G  Artefakte (§8) + Ausgaben (§9)
   Gate · /t · /a       2 Group-Layouts          (druck)/etiketten · core/qr
   /helfer · Check      23 Arbeitsseiten         CSV · Zwischenablage · xlsx
   _actions/*           _ui/* · _lib/nav|ampel   _lib/csv*.ts · _lib/bestandExport*.ts
        │              │                          │
        └──────────────┴──────────────┬───────────┘
                                      ▼
                    H  Fehlerzustaende (§11) + Testaufbau (§12)
                       error.tsx · die 40 Zustaende · E2E-Dateien
```

**Was die Kanten bedeuten:**

- **A vor allem.** Ohne den Registry-Eintrag wirft `getModule("lagerbuch")`, ohne `_lib/host.ts`
  hat keine Datei ihre erste Anweisung, und ohne die `COPY`-Zeile bricht der Container beim ersten
  Prod-Deploy (§2.2). **A enthält auch das Modul-Layout mit `metadata.manifest`** — es ist die
  Voraussetzung dafür, dass G seine PWA-Handler überhaupt bewerben kann.
- **B und C sind parallel baubar** und teilen nur A. B liefert `getDb()`; C benutzt es für den
  `tokens.aktiv`-Recheck (§3.4.4) und den `users`-Upsert (§4.13) — die **Signatur** genügt, der
  Rumpf nicht. Wer zuerst fertig ist, hat den anderen nicht blockiert.
- **D braucht beide.** Die reinen Funktionen (`_lib/domain/*`) hängen an nichts und können sogar vor
  B entstehen; die Lese- und Schreibpfade brauchen `getDb()` **und** die Guards. `_lib/zeit.ts`
  hängt an nichts und ist die früheste sinnvolle Datei überhaupt — jede Datumsableitung des Moduls
  läuft durch sie.
- **E, F und G teilen ausschließlich A–D.** Sie berühren verschiedene Route-Groups, verschiedene
  Rahmen und verschiedene Ausgabewege. **Drei Umsetzer können sie parallel bauen, sobald D steht** —
  mit drei benannten Kopplungen, die vorher geklärt sein müssen:
  1. **E und F teilen `_actions/`.** Der Guard-Scan aus §3.8.2 zählt über beide; wer eine Action
     hinzufügt, ohne einen Guard zu setzen, macht den Test des anderen rot. Das ist gewollt.
  2. **F und G teilen `verwaltung/`.** Die Group-Namen `(arbeit)` und `(druck)` und das Verbot eines
     `verwaltung/layout.tsx` müssen **vor** dem ersten Commit beider stehen (§6.15, Auflagen 1 und 2;
     eingelöst in §6.1.2). Dazu die dritte Kopplung an derselben Naht: **F und G teilen den Riegel**
     — beide Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin` aus
     `_lib/zugang.ts`; fällt der im `(druck)`-Layout weg, sind gedruckte Zugangs-Codes öffentlich
     (§6.1.3, §8.4).
  3. **E und G teilen `_ui/BarcodeScanner.tsx` und `_lib/barcode.ts`** — E baut sie, F und G rufen
     sie (§7.6.1).
- **F ist der größte der drei Knoten und steht vollständig in §6.** Was F liefert, steht in §6.1
  bis §6.14; woran es gebunden ist, in §6.15. Zwei Reihenfolgen innerhalb von F sind nicht frei:
  `_lib/ampel.ts` samt `_ui/verwaltung.module.css` (§6.6.2a) und `_ui/ikonen.tsx` (§6.5.2) sind
  Voraussetzung **jeder** Seite und gehören vor die erste `page.tsx`; die `.modulnav`-Reparatur
  (§6.3.2) ist `core` und hat einen eigenen Commit. ⚠️ **Was F nicht liefert**, sind die
  `revalidatePath`-Listen der Verwaltungs-Actions (§15.3, Nr. 23) — sie hängen an `_actions/` und
  damit an der Naht zu E.
- **H zuletzt, aber nicht am Ende.** Die Fehlerzustände (§11.5) sind über E, F und G verteilt und
  entstehen mit ihnen; was H zusätzlich bündelt, sind `error.tsx`, die Quelltext-Scans (§3.8.2,
  §7.12.2) und die E2E-Dateien. **Die Quelltext-Scans gehören ausdrücklich früh** — sie sind billig
  und sie fangen genau die Bauform-Fehler, die später teuer werden.

**Fünf Arbeiten außerhalb dieses Graphen, die vor dem Cutover erledigt sein müssen:**

1. **`iuk-suite/package.json`** um `jose`, `write-excel-file`, `@zxing/browser`, `@zxing/library`
   ergänzen (§1.2, Punkt 10) — sonst scheitert C an `jose` und G an `write-excel-file`. **Der
   früheste Schritt überhaupt.**
2. **`core/shell/icons.ts`** um `ContainerOutlined` ergänzen (§2.2, Punkt 5) — gehört zu A, ist aber
   eine `core`-Datei und braucht einen eigenen Commit.
3. **`iuk-suite/playwright.config.ts`**: `SUITE_HOST_LAGERBUCH`, die Gate-Zahlen, das
   Sitzungsgeheimnis, `SUITE_ADMIN_GROUP_LAGERBUCH` und der Seed-Schritt (§10.3, §12.6) — ohne sie
   ist H nicht ausführbar, und der Zwei-Host-Fall braucht zusätzlich einen zweiten erreichbaren Host.
4. **`core/shell/shell.module.css`**: `.modulnav` bekommt `overflow-x: auto` und `scrollbar-width:
   thin` (§6.3.2) — die einzige `core`-Änderung, die §6 verlangt. Sie gehört zu F, ist aber eine
   `core`-Datei mit Wirkung auf vier laufende Module und braucht einen eigenen Commit samt der zwei
   Zusicherungen (Quelltext-Scan in `shell-css.test.ts`, Playwright bei 1280×720). ⚠️ Ohne sie
   scrollt `/verwaltung/*` bei 1280px waagerecht — und zwar erst, wenn alle 15 Navigationseinträge
   stehen, also am Ende von F statt am Anfang.
5. **`src/core/bootstrap.ts`**: `lagerbuchBootFehler()` in das Fehler-Array von `assertHostConfig()`
   einhängen (§2.2, Punkt 9; Rumpf, Bedingung und Prüfliste in §10.5, §7.13.1) — die **dritte**
   `core`-Datei neben `icons.ts` und `shell.module.css`, ebenfalls eigener Commit. Sie gehört an den
   **Fuß von D**: vorher existiert `_lib/boot.ts` noch nicht, nachher laufen die sechs
   Boot-Prüfungen **nie**, und **kein Test macht das sichtbar** — `bootstrap.test.ts` koppelt nur das
   Migrations-Dreieck (`:82-107`), nicht die Boot-Haken.

---

## Anhang B: Geprüft und verworfen

Drei Vorschläge aus der Nacharbeit vom 03.08.2026 sind **nachgeprüft und nicht übernommen** worden.
Sie stehen hier, damit ein späterer Durchgang sie nicht ein zweites Mal aufwirft; die Begründung
steht je an der Stelle, die sie trägt, und wird hier nicht wiederholt.

| Vorschlag | Verworfen, weil | Wo die Begründung steht |
|---|---|---|
| Für den 8-C2-Zustand von `/g/<code>` eine **dritte, schlanke `_ui/GeraeteFehlerRahmen.tsx` ohne `Shell`** bauen, damit Auflage 1 unangetastet bleibt | Sie baute den ersten der drei Mängel nach, die 8-C2 behebt („ohne Shell und ohne Modulnavigation"), und der in 8-C2 verlangte Weg in die Geräteliste wäre ohne Navigation ein Einzelknopf auf einer Insel. Auflage 1 wird stattdessen auf ihren Zweck gefasst: sie verbietet **Layouts**, und `g/[code]/page.tsx` ist ein Blatt | §2.9 (Warnabsatz), §11.3, §6.15 Auflage 1 |
| `einloesenAmGate` soll die **nicht-werfende** Host-Prüfung benutzen (`lagerbuchHostOderNull` → `{ok:false}`), weil §7.3 für erwartbare Lagen Rückgabewerte vorschreibt | §7.3 nimmt den **Riegelfall** ausdrücklich aus, §11.5 Zustand 22 hält den Wurf als Zustand fest, und die Suite sagt denselben Satz (`m/files/(verwaltung)/actions.ts:26-28`). Ein Mensch erreicht die Lage gar nicht — die Gate-Seite rendert auf fremdem Host nicht. `lagerbuchHostOderNull` existiert bereits und bleibt die Form für **Route Handler** | §2.6 (Verankerungstabelle, Zeile `einloesenAmGate`), §3.2.1 |
| Es stehe **nirgends**, woher die Gate-Seite ihr *n* für „Bitte in *n* Sekunden erneut versuchen" nimmt | Die **Quelle** stand immer da (§3.9: „die Zahl kommt aus der lesbaren Sperrzeit"). Gefehlt hat der **Leser** — welche Datei die Schranke befragt. Der ist nachgetragen, die Behauptung „steht nirgends" trifft nicht zu | §3.9, §7.2.4 (Rumpf der Gate-Seite) |
