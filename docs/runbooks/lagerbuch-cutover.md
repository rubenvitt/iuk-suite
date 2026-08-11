# Runbook-Vorlauf — Lagerbuch-Cutover: die Befunde aus dem Bau

⚠️ **Dies ist noch nicht das Cutover-Runbook.** Es ist der Sammelort für die Befunde, die beim Bau
des Moduls entstanden sind und die ein Cutover-Runbook braucht — geschrieben wird dieses mit Spec 2,
nach dem Muster von `files-cutover.md`. Wer hier etwas hinzufügt, schreibt eine **gemessene**
Tatsache auf, keine Vermutung; jede Zeile unten nennt, woher sie stammt.

Grundlage: `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` · die sechs Teilpläne unter
`docs/superpowers/plans/` · `ENTSCHEIDUNGEN-lagerbuch.md` (dreizehn Betreiberentscheidungen vom
04.08.2026). Alt-Anwendung: `../lagerbuch` @ `ca04eb1`, eingefroren.

---

## 1. Der Import in `tokens` nennt seine Spalten — immer

**Gemessen beim Schema-Diff (Teil 1, T14).** `tokens` führt im regenerierten Schema sechs Spalten in
**anderer Reihenfolge** als die Alt-Anwendung:

| | Position 4 bis 9 |
|---|---|
| alt | `aktiv, created_at, created_by, last_used_at, ziel_typ, ziel_id` |
| neu | `ziel_typ, ziel_id, aktiv, created_at, created_by, last_used_at` |

Ursache: der Bestand bekam `ziel_typ`/`ziel_id` per `ALTER TABLE ADD` (`0003_token_ziel.sql`), und
SQLite hängt solche Spalten hinten an; das regenerierte Schema erzeugt die Tabelle in einem Rutsch
aus der Deklarationsreihenfolge. **Kein Schemafehler** — die unvermeidliche Folge von „regeneriert
statt kopiert". Spaltenmenge, Typen, Nullbarkeit, Defaults, Primär- und Fremdschlüssel sind
identisch (131 = 131 Spalten, 19 = 19 Fremdschlüssel, maschinell verglichen).

**Die Regel:** beim Import **immer die Spalten namentlich nennen**, nie `INSERT INTO tokens SELECT *
FROM alt.tokens`.

**Was `SELECT *` täte** — gegen echte Datenbanken gefahren, nicht hergeleitet: Zielposition *i*
empfängt Altposition *i*, also `ziel_typ ← aktiv`, `ziel_id ← created_at`, **`aktiv ← created_by`**.

- **Der Normalfall bricht laut ab:** ein Code, der nie eingelöst wurde oder kein Ziel hat, läuft in
  `NOT NULL constraint failed: tokens.created_at`. Laut, nicht still.
- **Der Paritätscheck wird ROT**, nicht grün. Die Warnung aus `CLAUDE.md` („ein konsistenter
  Mapping-Fehler ist paritätsgrün") gilt für *konsistente* Mappings; eine Spaltenverschiebung ist
  keines, weil die Inhalte sichtbar abweichen.
- ⚠️ **Die still gefährliche Variante ist deshalb nicht `SELECT *`, sondern eine von Hand
  geschriebene, aber falsch sortierte Spaltenliste.**

### Die Prüffrage, falls doch positionsweise importiert wurde

`aktiv` empfängt `created_by`, also den OIDC-`sub`. Ob daraus ein Ausfall oder ein **Zugangsgewinn**
wird, hängt an der Form dieses Werts — und zwar an dem, was SQLite beim Speichern in die
INTEGER-Spalte daraus macht:

| `created_by` | wird zu | Ergebnis |
|---|---|---|
| `"1"` · `"1.0"` · `" 1 "` · `"1e0"` · `"+1"` | integer `1` | ⚠️ **gesperrter Code wird reaktiviert** |
| UUID-artig · `"42"` · `"007"` · `"0"` · `"true"` | text bzw. anderer integer | Code bleibt gesperrt |

**Die Frage lautet: gibt es einen `sub`, dessen SQLite-INTEGER-Konversion exakt `1` ergibt?** Nicht
„sind meine `sub`s numerisch?" (zu weit — `42` bleibt gesperrt) und nicht „ist einer `'1'`?" (zu eng
— SQLite normalisiert `"1.0"`, `" 1 "`, `"1e0"` und `"+1"` ebenfalls auf `1`).

⚠️ **Dass der Schaden heute meist „nur" ein Totalausfall wäre, ist ein Zusammentreffen von `sub`-Form
und Drizzle-Mapper — keine Zusicherung.** `createdBy` ist `text().notNull()` ohne `CHECK` und ohne
Formatprüfung; der Wert kommt roh vom IdP. Und die Entwarnung hängt an Drizzles
`mapFromDriverValue(value) { return Number(value) === 1; }` — roh in JavaScript wäre
`Boolean('oidc-sub-xyz')` **wahr**. Sie ist an eine Fremdbibliothek geliehen, nicht verdient.

**Bauauflage, die daran hängt (Teil 2):** `tokens.aktiv` ausschließlich über die vom Schema gemappte
Spalte lesen (`eq(tokens.aktiv, true)` bzw. `zeile.aktiv`), **nie** über ein rohes `WHERE aktiv` oder
`WHERE aktiv != 0`. Ein Quelltext-Scan sieht den Unterschied **nicht**, weil beide Formen gültiges
Drizzle sind. Verankert in `2026-08-03-lagerbuch-modul-teil2.md` bei Task 25 (`_lib/helferZugang.ts`).

---

## 2. `__drizzle_migrations` der importierten Datenbank prüfen

**ClickUp: [DRK-188](https://app.clickup.com/t/86cb0q9v9).**

Der Drizzle-Migrator vergleicht ausschließlich `created_at` der letzten `__drizzle_migrations`-Zeile
gegen `folderMillis` — den gespeicherten **Hash liest er nie zurück**. Bringt die importierte
Datenbank die `__drizzle_migrations`-Zeilen der **Alt-Anwendung** mit, tragen die ältere Werte als
unsere vier Einträge (`when` ab `1785832220142`): alle vier gelten als ausstehend, `0000` führt
`CREATE TABLE artikel` auf eine bestehende Tabelle aus, und `migrateAllModules()` bricht ab.

⚠️ **Der Abbruch nimmt die ganze Suite mit** — portal, qr, feedback und files ebenso. Geerbte
Ausfallkopplung, keine neue; lagerbuch bringt aber mit vier Migrationen und handgeschriebenem
Trigger-SQL das bisher größte Migrationsrisiko der Suite mit.

**Prüfpunkt nach dem Import:**

```sql
select id, hash, created_at from __drizzle_migrations order by created_at;
```

Übernimmt der Import die **SQLite-Datei** der Alt-App, ist die Tabelle mit Alt-Zeilen gefüllt →
Startabbruch. Schreibt er **zeilenweise in eine frische, migrierte DB**, ist alles in Ordnung. Kein
`when`-Wert auf unserer Seite entschärft das; ein kleinerer wäre strikt schlechter, weil er nie
ausgeführt würde.

Bereits geprüft: ein zweiter Migrationslauf gegen dieselbe frische DB ist ein echtes No-op,
`__drizzle_migrations` bleibt bei vier Zeilen.

---

## 3. Der Edge-Proxy muss `X-Forwarded-Host` überschreiben

**Deployment-Invariante, im Repo nicht belegbar** — es liegt keine Traefik-/Compose-Konfiguration
hier, die es zeigt.

`_lib/host.ts` löst den Host über `resolveHost` auf, und das liest `x-forwarded-host` mit Vorrang vor
`host`. Nach dem Rewrite der Middleware ist das die einzig richtige Reihenfolge — aber der Header ist
client-fälschbar. Der Docblock in `core/routing.ts` begründet die Ungefährlichkeit damit, dass danach
`requiresAuth`/`canAccess` entscheiden; **für lagerbuch gilt dieses Argument nicht**, weil
`requiresAuth: false` genau diesen Auffangriegel entfernt.

Kein Befund gegen `_lib/host.ts`: der Riegel ist eine **Herkunfts-Hygiene-Grenze, keine
Autorisierungsgrenze**, und das gefährliche Szenario — der Browser eines Opfers auf einer zweiten,
unbeobachteten Herkunft — ist über Header-Fälschung nicht erreichbar, weil Browser diesen Header
nicht senden. Wer ihn fälschen kann, stellt die Anfrage ohnehin selbst.

**Vor dem Umschwenken belegen, dass der Edge-Proxy `X-Forwarded-Host` setzt statt durchreicht.**

---

## 4. Der Monitor zeigt auf den falschen Endpunkt

`<host>/api/health` antwortet weiterhin `ok`, **ohne etwas über lagerbuch zu sagen**. Die
Modulaussage liefert `/api/health/lagerbuch` — gemessen: `200` mit
`{"status":"ok","module":"lagerbuch"}`, und ein unbekanntes Modul liefert `503`. Die `200` ist damit
eine Aussage, kein Standardwert.

**Die Monitor-Umstellung von `<host>/api/health` auf `/api/health/lagerbuch` gehört ins
Cutover-Fenster.**

---

## 5. Das Migrationsverzeichnis wird nie regeneriert

`0001`–`0003` haben **kein** `meta/*_snapshot.json` — Drizzle kennt für SQLite kein Trigger-Primitiv,
also kann es keinen geben. Ein künftiges `drizzle-kit generate` diffed gegen `0000_snapshot.json` und
ist damit **blind gegenüber den vier Append-only-Triggern und der Handlager-Zeile**.

**Das Verzeichnis darf nie „von vorne" regeneriert werden.** Neue Migrationen kommen additiv dazu.

---

## 6. Handgriffe aus dem Entscheidungsprotokoll

Vollständig in `ENTSCHEIDUNGEN-lagerbuch.md`, Abschnitt „Was vor dem Cutover noch abzulesen oder zu
tun ist". Die zwei mit Ausfallwirkung:

- ⚠️ **`OIDC_ADMIN_GROUP` der laufenden Instanz gegen `lagerbuch_nutzer` gegenprüfen — und einmal
  echt einloggen**, bevor der Router umschwenkt. Die Boot-Prüfung fängt den **leeren**, nicht den
  **falschen** Wert, und für dieses Modul gibt es bewusst keine Suite-Admin-Rückfallebene. Ein
  falscher Wert ist ein stummes 404 für alle vier Personen (D3).
- **`backups/` aus dem Volume `lagerbuch_data` wegsichern, vor dem Abbau** — es ist die einzige
  historische Tiefe vor dem Cutover-Snapshot (D1).

---

## 7. ⚠️ `APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` müssen ZEICHENGLEICH derselbe Host sein

**Vor dem Umschwenken des Routers abzulesen und zu bestätigen** — das ist der teuerste Einzelposten
aus dem Bau von Teil 4 (dort R1, gemessen in der Abrufprobe von T87).

`helferCookieOptionen()` (`src/app/m/lagerbuch/_lib/helferSitzung.ts`) setzt das Sitzungscookie mit
`path: "/"` und **ohne** `domain`. Damit ist es an **genau die Origin** gebunden, auf der es gesetzt
wurde. Weicht der Host beim Umschwenken auch nur in der Schreibweise ab (`www.`, ein anderer
Subdomain-Stand, ein anderes Protokoll), dann:

- **endet JEDE laufende Feld-Sitzung** — schlagartig, für alle Helferinnen und Helfer gleichzeitig;
- **kein Test sieht das.** Vitest kennt nur einen Host, Playwright kennt nur `lagerbuch.localtest.me`,
  und `pnpm build` prüft keine Env-Werte gegeneinander.

**Handgriff:** `APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` nebeneinanderlegen und zeichenweise
vergleichen, bevor der Router umschwenkt.

**Wenn sie abweichen (müssen)**, gehört in die Cutover-Kommunikation der Satz:
„**Alle Helfer müssen ihr Kärtchen einmal neu scannen.**" — Kein Datenverlust, aber jede laufende
Sitzung ist weg, und eine Helferin mitten im Fahrzeug-Check verliert ihren im Client gehaltenen
Zwischenstand (ein Check dauert zehn bis zwanzig Minuten).

**Danach wird `APP_BASE_URL` ersatzlos gestrichen** — das ist Handgriff **R35** aus §15. Erst
ablesen und vergleichen, dann streichen; nie umgekehrt. Volltext der Begründung: §16.2.

---

## 8. Was beim Setzen von `SUITE_HOST_LAGERBUCH` schiefgehen kann

`validateHostConfig` prüft **nur Env-Hosts gegeneinander**. Ein Host, den ein anderes Modul über
`prodHosts` in der Registry führt, fällt **nicht** auf — dort gewinnt die Registry-Reihenfolge.
Beispiel: `SUITE_HOST_LAGERBUCH=iuk-ue.de` passiert die Boot-Prüfung fehlerfrei, aber `portal` führt
diesen Host und steht früher in `MODULES`; `moduleForHost` liefert `portal`, `istLagerbuchHost` gibt
`false`, und das Modul antwortet auf seiner eigenen konfigurierten Domain **404**.

Fail-closed, also kein Sicherheitsproblem — aber ein stiller Totalausfall. **Der Abruf gegen die neue
Domain nach dem Setzen der Variablen fängt es**, und nur er.

---

## 9. Der Rückweg nach der Anmeldung — eine Prüfung, die nur der Betrieb beantworten kann

`verwaltungsZiel()` in `src/app/m/lagerbuch/_lib/zugang.ts` leitet das Protokoll aus
`x-forwarded-proto` ab. Das ist das im Repo erprobte Muster — `files` und `qr` bauen ihre
öffentlichen Adressen produktiv damit —, **aber aus dem Repository ist nicht beweisbar, dass der
Proxy den Header setzt.**

**Nach dem Umschwenken des Routers einmal ausführen:**

```bash
curl -sI https://lagerbuch.iuk-ue.de/verwaltung
```

Im `Location` muss `…callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung` stehen.

⚠️ Steht dort `http%3A%2F%2F`, terminiert der Proxy **ohne** `X-Forwarded-Proto`. Dann bricht
`core/auth/redirect.ts:52` an der Protokollgleichheit ab, und **der Rückweg nach der Anmeldung
landet still auf dem Portal** statt auf der Lagerbuch-Verwaltung. Kein Fehler, keine Meldung — die
verwaltende Person sieht einfach die falsche Seite und hält es für einen Bedienfehler.

Gehört zusammen mit §8 abgearbeitet: dieselbe Domain, derselbe Handgriff, zwei Abrufe.

---

## 10. Nachkontrolle nach dem Umschwenken: Manifest, Icons, Negativprobe (R2)

Aus Teil 4, T87 — die lokalen Werte sind **gemessen** (Abrufprobe gegen einen echten Server auf
Port 3200), die Prod-Abrufe stehen aus.

```bash
curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest   # erwartet: 200 application/manifest+json
curl -si https://lagerbuch.iuk-ue.de/icon-192.png           # erwartet: 200, Content-Length 1558
```

Beides gegen §7.10.2 der Spec halten. **Dazu die Negativprobe** — der Portal-Host darf das
Lagerbuch-Manifest **nicht** liefern:

```bash
curl -si https://<portal-host>/manifest.webmanifest
```

Lokal war das ein 307 in den Login, ohne jede Lagerbuch-Marke. Ein 200 mit Lagerbuch-Inhalt hieße,
dass der Host-Riegel der fünf PWA-Route-Handler nicht greift.

Diese Negativprobe **ist** Handgriff **R36** aus §15 — sie darf nicht ausgelassen werden, weil
`start_url: "/"` ohne gesetztes `SUITE_HOST_LAGERBUCH` aufs Portal zeigt und eine installierte PWA
dann im falschen Modul startet. Volltext: §16.2.

---

## 11. Generalprobe auf EINEM Gerät (R3)

Aus Teil 4, T87. **Keine Code-Antwort** — die drei Schritte sind aus dem Repository heraus
strukturell nicht beweisbar:

1. PWA vom Lagerbuch-Host aus installieren (Startbildschirm).
2. Im **Browser** ein Kärtchen einlösen.
3. Ein Regaletikett mit der **Systemkamera** scannen.

⚠️ Auf iOS führt das Startbildschirm-Fenster eine **eigene Speicherpartition**: eine im Browser
eingelöste Sitzung ist in der installierten PWA nicht da, und umgekehrt. Das ist kein Defekt, aber
es muss vor dem Cutover einmal gesehen worden sein — sonst wird es am ersten Einsatztag als
Ausfall gemeldet.

Gehört mit §13 zusammen abgearbeitet: Schritt 3 (Systemkamera-Scan) setzt einen sicheren Kontext
voraus — über eine IP oder `http://` zeigt der Scan nur `KEIN_SICHERER_KONTEXT`, siehe §13.

---

## 12. Verwaltungsoberfläche: sichtbare Änderungen und Modus-Abnahme

**Gemessen bei der Teil-5-Abnahme (T151).** Die Verwaltungsseiten `/verwaltung/artikel`,
`/verwaltung/verfall` und `/verwaltung` wurden mit dem echten Umschalter jeweils im hellen und im
dunklen Modus gerendert. Neben den berechneten Farben und Rahmen wurden sechs Screenshots visuell
geprüft: Tabellen, Ampelringe, Status-Chips, Verfallskarten und KPI-Kanten blieben lesbar; im
Dunkelmodus erschien keine weiße Fremdfläche und es war kein Inhalt offensichtlich abgeschnitten.

Zwei sichtbare Änderungen gehören **vor** dem Umschwenken in die Ankündigung:

- **Die Ampelfarben ändern sich.** Gelb wird dunkler (`#b26a00` → `#8a5200`), Rot bekommt einen
  eigenen Ton (`#c8000f` → `#8c0d16`). Das stellt Luminanz-Monotonie her und beseitigt den
  gemessenen AA-Verstoß des bisherigen gelben Chips.
- **Die eigenständige Wortmarke „LAGERBUCH“ verschwindet aus der Verwaltung.** Dort steht künftig
  der reguläre Modultitel `Lagerbuch` in der Suite-Kopfzeile. Auf dem Gate und im Helfer-Rahmen
  bleibt die Wortmarke als Wiedererkennungsmerkmal erhalten.

**Cutover-Kontrolle:** Die drei genannten Verwaltungsseiten auf der Zielinstallation noch einmal in
beiden Modi durchsehen. Der Vergleich eines Etikettenbogens auf echtem Papier mit einem alten
Ausdruck bleibt ausdrücklich Teil 6 (§8.4 R30); die lokale Teil-5-Abnahme ersetzt ihn nicht.

---

## 13. ⚠️ Die Generalprobe MUSS über HTTPS laufen — sonst sind die Kamerawege ungeprüft

**Gemessen bei der Abnahme (T175).** Handgriff: **die Generalprobe über einen echten
HTTPS-Namen fahren, nie über eine IP und nie über `http://`.**

Ohne sicheren Kontext gibt es kein `getUserMedia`. `/verwaltung/geraete/scan` und
`/verwaltung/bz/scan` zeigen über `http://` **ausschließlich** den Zustand
`KEIN_SICHERER_KONTEXT` samt manuellem Ersatzfeld — die Kamera wird nie angefragt.

Das ist **kein Defekt**: `src/app/m/lagerbuch/_ui/BarcodeScanner.tsx` schreibt den Zustand aus,
und §3.5.2 der Spec kennt ihn. Was fehlte, war die Betriebsfolge — dieses Runbook hatte dazu bis
heute keine Zeile.

⚠️ **Wer die Generalprobe über eine IP oder `http://` fährt, zieht einen von zwei falschen
Schlüssen:** die Scan-Seiten seien kaputt (sie sind es nicht), **oder** sie seien geprüft (sie sind
es nicht). Der zweite ist der teurere — er trägt eine ungeprüfte Kamerastrecke in den ersten
Einsatztag.

Gehört mit §11 zusammen abgearbeitet: dieselbe Generalprobe, ein Vorbehalt an ihren Zugang.

---

## 14. Checks aus dem Import: „Ergebnis unlesbar" ist gebaut, „offener Check" nicht

**Handgriff nach dem Import, vor der Freigabe — EINE Abfrage entscheidet:**

```sql
select count(*) from checks where ergebnis is null;
```

**Ist die Zahl 0, ist dieser Abschnitt erledigt.** Ist sie es nicht, weiter lesen: **so viele Checks
zeigen nach dem Umzug „0 Positionen", ohne leer zu sein.**

`ergebnis IS NULL` ist die maßgebliche Spalte, und zwar allein — `checkErgebnis.ts:200` gibt für
`null` das leere Ergebnis **ohne** Unlesbar-Kennzeichen zurück, unabhängig davon, was in
`completed_at` steht. Zum Einordnen der Treffer (**nicht** zum Abhaken):

```sql
select completed_at is null as offen, count(*)
  from checks where ergebnis is null group by 1;
```

`offen = 1` sind regulär offene Checks (§4.4). ⚠️ **`offen = 0` ist ein Datenbefund:** eine Zeile mit
Abschlusszeitpunkt, aber ohne Ergebnis — das erzeugt das Modul nie, und sie gehört einzeln
angesehen, bevor sie freigegeben wird.

**Was gebaut ist:** ein Check, dessen `ergebnis` **unlesbar** ist (kein JSON, falsche Form, oder
geschrieben-aber-leer), zeigt auf der Detailseite die Meldung „**Ergebnis unlesbar**" und in der
Positionen-Spalte der Übersicht das Wort `unlesbar` — **statt einer ruhigen `0`**. Nachgebaut am
11.08.2026 (§11.5, Zustand 27); vorher log dort eine `0`, die wie ein leerer Check aussah. **Diese
Zeilen fängt die Abfrage oben nicht** — sie tragen einen Wert — und sie brauchen es auch nicht: sie
sagen es auf der Oberfläche selbst.

⚠️ **Was NICHT gebaut ist:** ein Check mit `ergebnis IS NULL` erscheint weiterhin als Check mit
„**0 Positionen**". Bewusst so entschieden — `ergebnis IS NULL` als „unlesbar" zu lesen hätte
**jeden** von §4.4 vorgesehenen offenen Check falsch gekennzeichnet, aus einer Lüge wären zwei
geworden. Board-Posten [DRK-196](https://app.clickup.com/t/86cb403fu).

**Warum das ein Cutover-Thema ist und kein Bau-Thema:** im Normalbetrieb sind solche Zeilen offene
Checks und verschwinden von selbst — **der Datenimport aus der Alt-Anwendung kann sie in Mengen und
in Formen mitbringen, die das Modul nie erzeugt.** Zählt die erste Abfrage mehr als 0, gehört die
Zahl in die Cutover-Kommunikation.

---

## 15. Die sieben Übergaben aus Teil 6 als Handgriffe (R30–R36)

Handlung zuerst, Reihenfolge im Ablauf, Begründung dahinter. **Der vollständige Wortlaut jeder
Zeile steht in §16.2** — dort und nur dort, damit es eine Fassung gibt und nicht zwei.

| # | Wann | Handgriff |
|---|---|---|
| **R30** | ⚠️ **VOR dem Cutover**, mit Vorlauf für Nachbestellung | **Probebogen drucken** — echter Drucker, echtes gekauftes Etikettenmaterial, mit **zwei** Telefonen aus 15 cm gescannt, je fünf Etiketten aus der **ersten und der letzten** Zeile. **Keine Zeile, die man nachholt:** ein falsch bedruckter Bogen kostet gekauftes Material und einen Gang durch alle Fahrzeuge. Benannter Rückfall bei Fehlschlag steht in §16.2 |
| **R31** | Direkt **nach** dem ersten Etikettendruck | **Reihenfolge in `SUITE_HOST_LAGERBUCH` einfrieren.** Ab hier keine Umsortierung mehr — sie ändert **still** jeden ab dann gedruckten Bogen |
| **R32** | In die Cutover-Kommunikation | **Ansagen: die Menge der physisch hängenden Etiketten ist echt größer als die der nachdruckbaren.** Ein deaktivierter Artikel bleibt bebuchbar, ist aber nie wieder nachdruckbar. Die Differenz ist im Repo **nicht abzählbar** |
| **R33** | In die Ankündigung, **vor** dem Umschwenken | **Ankündigen: zwei Knopfbeschriftungen auf `/verwaltung/bestellung` ändern sich** — `Liste kopieren` → `Liste kopieren (nur offene)`, `CSV` → `CSV (alle Zeilen)` |
| **R34** | In die Ankündigung, **vor** dem Umschwenken | **Ankündigen: ein Zugangs-Code kann nach dem Cutover nur noch gesperrt, nie mehr gelöscht werden.** Wer heute einen versehentlich angelegten Code löscht, findet den Knopf nicht mehr — mit Grund ankündigen, nicht kommentarlos wegnehmen |
| **R35** | **Ablesen vor** dem Umschwenken, **streichen beim** Umschwenken | **`APP_BASE_URL` ersatzlos streichen** — aber ihren heutigen Wert **vorher ablesen** und gegen `https://lagerbuch.iuk-ue.de` zeichenweise vergleichen (§7). Eine Angabe, zwei Folgen: gedruckte QR-Codes **und** das Überleben der Helfer-Sitzungen |
| **R36** | **Nach** dem Umschwenken | **`curl -si https://<portal-host>/manifest.webmanifest`** — es darf das lagerbuch-Manifest **NICHT** liefern (§10) |

---

## 16. Übergabe an Spec 2 — Datenumzug, Generalprobe, Cutover

⚠️ **Diese Sektion muss vollständig und wörtlich in das echte Cutover-Runbook übernommen werden —
nicht zusammenfassen, nicht nur verlinken.** Dieses Dokument ist der Vorlauf, **nicht** das
Cutover-Runbook (siehe Kopf dieser Datei): §16 ist darin die einzige Sektion mit
**Übernahmepflicht** — keine gemessene Einzeltatsache aus dem Bau wie §1–§15, sondern die
verbindliche Übergabeliste an Spec 2. Wer sie beim Schreiben des echten Runbooks (nach dem Muster
von `files-cutover.md`) als „eine von vielen Fundstellen" behandelt statt als Pflichtquelle,
verliert die Übergabe an Spec 2.

**Diese Liste ist verbindlich. Wo Spec 2 davon abweicht, ist es ein Fehler in Spec 2, nicht hier**
(§1.4). Sie steht hier vollständig und nicht als Verweis: das **künftige** Cutover-Runbook (nicht
dieses Vorlauf-Dokument) wird unter Zeitdruck gelesen, und ein Verweis in eine 845-KB-Spec ist unter
Zeitdruck kein Verweis.

*Wörtlich übernommen aus `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`, §10
(Schritte 5 und 6 von T176). Die Abschnittsnummern sind an dieses Dokument angepasst (§10.1 →
§16.1, §10.2 → §16.2, §10.3 → §16.3), und der Satz zum Zeitdruck nennt hier ausdrücklich das
**künftige** Runbook, weil dieses Dokument noch der Vorlauf ist — das sind die einzigen zwei
bewussten Abweichungen. Der Tabelleninhalt ist zeichengleich.*

### 16.1 Was Spec 2 aus Spec 1 erbt

| Festlegung | Wert | Folge für Spec 2 |
|---|---|---|
| **Modul-Key** | `lagerbuch` | DB-Datei `lagerbuch.db` unter `DATA_DIR`; `SUITE_HOST_LAGERBUCH`, `SUITE_ADMIN_GROUP_LAGERBUCH` |
| **Migrationsverzeichnis** | `src/app/m/lagerbuch/_db/migrations` | Dateinamen kommen aus `meta/_journal.json` und werden **nicht** erfunden |
| **Prod-Domain** | `lagerbuch.iuk-ue.de`, ausschließlich über `SUITE_HOST_LAGERBUCH`; Registry `prodHosts: []` | Cutover = **eine** `.env`-Zeile plus `SUITE_TRAEFIK_RULE`; Rollback = dieselbe Zeile leeren. ⚠️ **Die gedruckten Etiketten werden dadurch nicht konfigurierbar** |
| **Öffentliche Pfadform** | `/`, `/t/<code>`, `/g/<code>`, `/a/<artikelId>`, `/helfer/*`, `/verwaltung/*` bleiben **wörtlich** | Der Rewrite `<host>/a/x` → `/m/lagerbuch/a/x` macht das ohne Änderung; die Entscheidung gehört trotzdem ausdrücklich ins Runbook |
| **Append-only** | die zwei Trigger aus `drizzle/0001_append_only.sql` **plus** das neue Paar auf `bz_kontrollen` | Ein Importer mit reinem `INSERT` läuft durch; **`onConflictDoUpdate` — das Muster beider vorhandener Importer — bricht** an `buchungen` beim zweiten Lauf. Wiederholbar ist `INSERT OR IGNORE`. ⚠️ **`INSERT OR REPLACE` ist die Falle:** es läuft bei `recursive_triggers = 0` (dem Default) durch und **umgeht den Trigger** |
| **Einfügereihenfolge** | artikel → fahrzeug_templates → template_positionen → lagerorte → chargen → soll_positionen → buchungen/checks/lagerort_verfall → bz_geraete/o2_flaschen/geraete → bz_kontrollen/o2_messungen → tokens → users | `lagerorte.templateId` → `fahrzeug_templates` sieht rückwärts aus; zweite Abhilfe ist `PRAGMA defer_foreign_keys = ON` **innerhalb** der Transaktion |
| **Zeitstempel-Einheit** | UNIX-**Sekunden**, Drizzle `mode: "timestamp"` | ⚠️ **Ein Faktor-1000-Fehler ist paritätsgrün.** Der Mapper normalisiert auf ganze Sekunden |
| **Zeitzone** | `Europe/Berlin` als **Modulkonstante** im Code | `TZ` wird von Spec 1 **nicht** gesetzt; der Wert ist Runbook-Eingabe. Das Modul hängt bewusst nicht daran |
| **Geheimnisse** | **nur** `HELFER_SESSION_SECRET` aus der produktiven `stack.env`, unter dem neuen Namen `LAGERBUCH_HELFER_SITZUNG_SECRET` | Laufende Helfer-Sitzungen (bis 12 h) überleben den Cutover — **nur, wenn der Modul-Host zeichengleich der heutige ist** (host-only Cookie). `AUTH_SECRET` der Suite bleibt unverändert. Abbau-Zeile: alte `stack.env` löschen |
| **Kennungen (`sub`)** | ✅ **gemessen: gleich.** `subject_types_supported: ["public"]`, keine pairwise identifiers | **Es gibt keine Zuordnungstabelle**, und sie wird nicht gebraucht: der Weg fällt **per Identität** zur Nulloperation zusammen. ⚠️ Der Paritätscheck beantwortete die Frage nie (in beiden Fällen grün); die Stichprobe R11 bleibt |
| **`users`-Tabelle** | Altbestand wird **gefiltert übernommen**, nicht geleert | Eine Zeile wandert genau dann, wenn ihre `id` in einer der sechs Autorenschaftsspalten vorkommt — das Prädikat **ist** der Waisenfilter. ⚠️ **Ausnahme:** Personen, deren einzige `users`-Zeile eine Waise ist (letzte Anmeldung vor `f2b515b`, 29.07.2026). Für die zeigt das Journal die **rohe Kennung**, und ihr Klarname steht **nur** in der Zeile, die der Filter aussortiert → **Bereinigung über die Klarnamen**, keine Übersetzungstabelle. `select count(*) from users` ist ohnehin **keine** Personenzahl |
| **`BESTELL_FAKTOR`** | **ersatzlos gestrichen** | Kein Produktivpfad liest das Feld; ein produktiv gesetzter Wert hat nie etwas bewirkt. Er wandert **nicht** mit |
| **Bestellvorschlag** | Lückenformel `max(0, mindestbestand − bestand)` | Die Faktor-Formel ist tot; keine Zeile der Bestellliste ändert sich |
| **Health** | `/api/health/lagerbuch` | ⚠️ `<host>/api/health` antwortet nach dem Cutover weiter `ok`, **ohne etwas über lagerbuch zu sagen** (Falle 51). Monitor und `deployment.md` umstellen |
| **Alte Modul-Endpunkte** | `src/app/api/health/route.ts` und `src/app/api/auth/[...nextauth]/route.ts` werden **nicht** portiert | Beide Präfixe stehen in `PASSTHROUGH` und erreichen das Modul nie |
| **Rollback-Körnung** | grob | Ein Rückzug auf ein älteres Image nimmt portal, qr, feedback und files mit. **Der Teilrückzug ist `SUITE_HOST_LAGERBUCH` leeren + Host aus `SUITE_TRAEFIK_RULE`** — er nimmt die Domain vom Netz, statt eine ältere lagerbuch-Version auszuliefern |

### 16.2 Was **dieser Plan** zusätzlich an Spec 2 übergibt

| # | Übergabe | Warum sie nicht warten kann |
|---|---|---|
| **R30** | **Probebogen** auf dem tatsächlich benutzten Drucker, auf das tatsächlich gekaufte Etikettenmaterial, mit **zwei** Telefonen aus 15 cm gescannt — je fünf Etiketten aus der **ersten und der letzten** Zeile (8-I) | Kein Test kann das: `build` und Vitest sehen `@media print` gar nicht, Playwright rendert für den Bildschirm. Ein fehlerhafter Bogen kostet gekauftes Material und einen Gang durch alle Fahrzeuge. **Benannter Rückfall bei Fehlschlag:** optionaler `margin`-Parameter an `core/qr#qrSvg`, vom Etikettenbogen auf `1` gesetzt, an der Aufrufstelle mit dem Messergebnis begründet. **Level H bleibt in beiden Fällen** |
| **R31** | **Die Reihenfolge in `SUITE_HOST_LAGERBUCH` wird nach dem ersten Etikettendruck eingefroren** (8-B) | `moduleUrl` nimmt `prodHostsFor(mod)[0]`. Eine Umsortierung ändert **still** jeden ab dann gedruckten Bogen, während die alten Etiketten weiter auf den früheren ersten Eintrag zeigen. ⚠️ Fällt Betreiberfrage 9 auf „alte Domain mitlaufen lassen", **muss `lagerbuch.iuk-ue.de` Index 0 bleiben** |
| **R32** | **Die Menge der physisch hängenden Etiketten ist echt größer als die der nachdruckbaren** (Falle 26) | `etikettenDaten` filtert hart auf `aktiv = true`; ein deaktivierter Artikel bleibt unter `/a/<id>` **bebuchbar**, ist aber nie wieder nachdruckbar. **Die Differenz ist im Repo nicht abzählbar.** Wer nach dem Cutover nachdrucken will und den Artikel nicht findet, sucht sonst einen Fehler, wo eine Entscheidung ist |
| **R33** | **Ankündigung: die beiden Knopfbeschriftungen auf `/verwaltung/bestellung` ändern sich** — `Liste kopieren` → `Liste kopieren (nur offene)`, `CSV` → `CSV (alle Zeilen)` (9-A) | Die beiden Wege liefern **verschieden viele Zeilen**, und heute verrät das nichts. Der Umfang bleibt; die Beschriftung wird ehrlich |
| **R34** | **Entscheidung 8-F ist eine Verhaltensänderung mit Ankündigungspflicht:** ein Zugangs-Code kann nach dem Cutover **nur noch gesperrt**, nie mehr gelöscht werden | Verwaltende, die heute einen versehentlich angelegten Code löschen, finden den Knopf nicht mehr. Der Grund gehört in die Ankündigung: ein gelöschter Code konnte an ein später ausgestelltes Kärtchen zurückfallen, und historische Journalzeilen erschienen danach unter dem **neuen** Label |
| **R35** | **`APP_BASE_URL` wird beim Cutover ersatzlos gestrichen** (8-B) | Sie wäre eine **sechste** Wahrheit neben `SUITE_HOST_LAGERBUCH`. ⚠️ Ihr heutiger Wert ist trotzdem **vorher** abzulesen: der Cutover muss verifizieren, dass er zeichengleich `https://lagerbuch.iuk-ue.de` lautet — sonst ist **jeder gedruckte QR aus Form 1 und 2 auf den alten Wert gebrannt**, und die Entscheidung fällt auf „alter Host als zweiter Eintrag" zurück. **Eine Frage, zwei Folgen:** dieselbe Angabe entscheidet, ob die Helfer-Sitzungen den Cutover überleben (host-only Cookie) |
| **R36** | **`curl -si https://<portal-host>/manifest.webmanifest` darf das lagerbuch-Manifest NICHT liefern** | `start_url: "/"` zeigt ohne gesetztes `SUITE_HOST_LAGERBUCH` aufs **Portal**; eine installierte PWA startete dann im falschen Modul (Falle 56) |

### 16.3 Drei Dinge, die Spec 2 **nicht** von hier erbt

| Gegenstand | Warum nicht | Wo es hingehört |
|---|---|---|
| **`TZ=Europe/Berlin` setzen** | Der Suite-Container fährt heute ohne `TZ`; `node:26-alpine` liefert UTC. Alles, was portal, qr, feedback und files an Datumsgrenzen gezogen haben, ist in **UTC** gezogen worden — ein nachträgliches `TZ` verschöbe jede solche Grenze um ein bis zwei Stunden | **Eigener Schritt mit eigener Prüfung gegen die vier laufenden Module** (§1.5, Punkt 1) |
| **Das Entfernen des Suite-Admin-Kurzschlusses** (`core/groups.ts:104`) | `isModuleAdmin` steigt heute für **jedes** Modul beim Suite-Admin früh mit `true` aus. Der Kurzschluss ist **kein Versehen** — `core/groups.ts:14` schreibt seinen Zweck aus. Ihn zu entfernen ist `core`-Arbeit und berührt portal, qr und files | Eigene Suite-Entscheidung. lagerbuch erreicht dasselbe Ziel modulintern, indem es `isModuleAdmin` gar nicht benutzt — und ist damit **vorwärtskompatibel** zu dem Refactoring |
| **Das suiteweite Gating von `/m/*`** | Dass `/m/<key>/*` von jedem Suite-Host beantwortet wird, ist eine **Klasse** und kein lagerbuch-Problem (Falle 61) | Eigene Suite-Spec. Für Phase 5 genügt der modulinterne Host-Riegel — ⚠️ **lagerbuch ist allerdings das erste Modul, bei dem diese Klasse eine DATENWIRKUNG hätte statt einer kosmetischen**, und genau deshalb ist der Riegel dort nicht optional |

Ebenso benachbart und ausdrücklich **nicht** durchgeführt: die Hebung des DOM-Test-Harness nach
`src/core/` (§12.2). Der benannte Auslöser („sobald ein drittes Modul es braucht") ist mit `files`
längst gefallen; die Hebung berührt über dreißig Importzeilen in drei fremden Modulen und
`CLAUDE.md:106-107`, bringt lagerbuch **keinen** Nutzen und machte aus einem Modul-Port eine
repo-weite Umbenennung **mitten in einer Cutover-Vorbereitung**. Sie gehört als eigener, benannter
Suite-Posten protokolliert — **nicht** still über eine Modul-Spec eingeführt, und ebenso wenig still
weiter übergangen.

---

## Offene Posten auf dem Board

| Posten | Inhalt |
|---|---|
| [86cb0q9ut](https://app.clickup.com/t/86cb0q9ut) | `core/bootstrap.test.ts` härten — der Wächter des Registrierungs-Dreiecks sieht weder eine auskommentierte noch eine falsch gezielte `COPY`-Zeile. Vorbestehend, betrifft alle fünf Module. |
| [DRK-188](https://app.clickup.com/t/86cb0q9v9) | Der `__drizzle_migrations`-Prüfpunkt aus §2. |
| [DRK-192](https://app.clickup.com/t/86cb3y71b) | ~47 veraltete `datei:zeile`-Kommentaranker unter `m/lagerbuch/`. Achte Instanz der Fundort-Klasse; T172s Bericht behauptet „nur einer" und liegt damit falsch. |
| [DRK-193](https://app.clickup.com/t/86cb3y74v) | `_actions/buchung.ts` reicht im `catch` auch rohen SQLite-Text an die Oberfläche durch. **Kein Verstoß** — der Kanal ist gewollt und dokumentiert —, aber ein benannter Rand; Behebung wäre ein Sentinel-Fehlertyp und damit ein Entwurfseingriff. |
| [86cb3y7db](https://app.clickup.com/t/86cb3y7db) | Drei ungetestete Anzeigeränder: Bestellvorschlag-Leertext, `EtikettenBasisFehlt`-Render (strukturell, async RSC), CheckFlow-Fußnote. |
| [86cb3y7h0](https://app.clickup.com/t/86cb3y7h0) | Zwei Teil-1-Nachweise sind Protokoll-Übernahmen statt Messungen (COPY-Gegenprobe des Dreiecks, Schema-Diff). Hängt an 86cb0q9ut. |
| [DRK-196](https://app.clickup.com/t/86cb403fu) | Ein **offener** Check (`ergebnis IS NULL`) erscheint als Check mit „0 Positionen" — siehe §14. Heute harmlos, nach dem Cutover nicht: der Datenimport kann solche Zeilen mitbringen. |
| [86cb403u5](https://app.clickup.com/t/86cb403u5) | `/verwaltung/checks/[id]` ist E2E nur punktuell gedeckt: der neue Zustand ja, der Rest der Seite (Abgleich, Nachfüllung, Geräte, Sauerstoff, Verfall, Kacheln) nicht. |
