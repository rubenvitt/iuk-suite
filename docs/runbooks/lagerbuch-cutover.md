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

## 7. Was beim Setzen von `SUITE_HOST_LAGERBUCH` schiefgehen kann

`validateHostConfig` prüft **nur Env-Hosts gegeneinander**. Ein Host, den ein anderes Modul über
`prodHosts` in der Registry führt, fällt **nicht** auf — dort gewinnt die Registry-Reihenfolge.
Beispiel: `SUITE_HOST_LAGERBUCH=iuk-ue.de` passiert die Boot-Prüfung fehlerfrei, aber `portal` führt
diesen Host und steht früher in `MODULES`; `moduleForHost` liefert `portal`, `istLagerbuchHost` gibt
`false`, und das Modul antwortet auf seiner eigenen konfigurierten Domain **404**.

Fail-closed, also kein Sicherheitsproblem — aber ein stiller Totalausfall. **Der Abruf gegen die neue
Domain nach dem Setzen der Variablen fängt es**, und nur er.

---

## Offene Posten auf dem Board

| Posten | Inhalt |
|---|---|
| [86cb0q9ut](https://app.clickup.com/t/86cb0q9ut) | `core/bootstrap.test.ts` härten — der Wächter des Registrierungs-Dreiecks sieht weder eine auskommentierte noch eine falsch gezielte `COPY`-Zeile. Vorbestehend, betrifft alle fünf Module. |
| [DRK-188](https://app.clickup.com/t/86cb0q9v9) | Der `__drizzle_migrations`-Prüfpunkt aus §2. |
