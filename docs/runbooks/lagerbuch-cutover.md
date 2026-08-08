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

## Offene Posten auf dem Board

| Posten | Inhalt |
|---|---|
| [86cb0q9ut](https://app.clickup.com/t/86cb0q9ut) | `core/bootstrap.test.ts` härten — der Wächter des Registrierungs-Dreiecks sieht weder eine auskommentierte noch eine falsch gezielte `COPY`-Zeile. Vorbestehend, betrifft alle fünf Module. |
| [DRK-188](https://app.clickup.com/t/86cb0q9v9) | Der `__drizzle_migrations`-Prüfpunkt aus §2. |
